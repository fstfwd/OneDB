module.exports = {};

const crypto = require('crypto');
const validate = require('./validate');

const DOLLAR = "\uFF04";
const KEY_REPLACEMENTS = {
  dollar: {
    encode: /\$/g,
    decode: new RegExp(DOLLAR, 'g'),
    encoded: DOLLAR,
    decoded: '$',
  },
}

const KEY_REGEX = /^(\$|\$ref|\$id|\$comment|\$schema|[A-Za-z]\w*)$/;

const USER_KEYS = module.exports.USER_KEYS = {
  all: '_all',
  user: '_user',
  system: '_system',
  owner: '_owner',
}

const START_TIME = new Date(Date.now());
const SYSTEM_INFO = module.exports.SYSTEM_INFO = {
  created: START_TIME,
  updated: START_TIME,
  created_by: USER_KEYS.system,
}

const OWNER_ACL = module.exports.OWNER_ACL = {
  read: [USER_KEYS.owner],
  write: [USER_KEYS.owner],
  append: [USER_KEYS.owner],
  delete: [USER_KEYS.owner],
}

const OWNER_ACL_SET = module.exports.OWNER_ACL_SET = {
  allow: OWNER_ACL,
  modify: OWNER_ACL,
}

const SYSTEM_ACL = module.exports.SYSTEM_ACL = {
  read: [USER_KEYS.system],
  write: [USER_KEYS.system],
  append: [USER_KEYS.system],
  delete: [USER_KEYS.system],
}

const READ_ONLY_ACL = module.exports.READ_ONLY_ACL = {
  read: [USER_KEYS.all],
  write: [USER_KEYS.system],
  append: [USER_KEYS.system],
  delete: [USER_KEYS.system],
}

const READ_ONLY_ACL_SET = module.exports.READ_ONLY_ACL_SET = {
  allow: READ_ONLY_ACL,
  modify: SYSTEM_ACL,
};

const PRIVATE_ACL_SET = module.exports.PRIVATE_ACL_SET = {
  allow: SYSTEM_ACL,
  modify: SYSTEM_ACL,
}

module.exports.encodeDocument = function(doc) {
  if (typeof doc !== 'object' || doc === null) return doc;
  if (Array.isArray(doc)) return doc.map(module.exports.encodeDocument);
  let obj = {};
  for (let key in doc) {
    if (!KEY_REGEX.test(key)) throw new Error(`Object key ${key} is invalid`);
    let newKey = key;
    for (let replaceKey in KEY_REPLACEMENTS) {
      let replacement = KEY_REPLACEMENTS[replaceKey];
      newKey = newKey.replace(replacement.encode, replacement.encoded);
    }
    obj[newKey] = module.exports.encodeDocument(doc[key]);
  }
  return obj;
}

module.exports.decodeDocument = function(doc) {
  if (typeof doc !== 'object' || doc === null) return doc;
  if (Array.isArray(doc)) return doc.map(module.exports.decodeDocument);
  let obj = {};
  for (let key in doc) {
    let newKey = key;
    for (let replaceKey in KEY_REPLACEMENTS) {
      let replacement = KEY_REPLACEMENTS[replaceKey];
      newKey = newKey.replace(replacement.decode, replacement.decoded);
    }
    obj[newKey] = module.exports.decodeDocument(doc[key]);
  }
  return obj;
}

const SALT_LENGTH = 32;
const VERIFICATION_ID_LENGTH = 16;
const ITERATIONS = 25000;
const KEY_LENGTH = 512;
const DIGEST_ALGO = 'sha256'

module.exports.computeCredentials = (password) => {
  return new Promise((resolve, reject) => {
    let result = {};
    crypto.randomBytes(SALT_LENGTH, (err, buf) => {
      if (err) return reject(err);
      result.salt = buf.toString('hex');
      crypto.pbkdf2(password, result.salt, ITERATIONS, KEY_LENGTH, DIGEST_ALGO, (err, hashRaw) => {
        if (err) return reject(err);
        result.hash = new Buffer(hashRaw, 'binary').toString('hex');
        resolve(result);
      });
    });
  });
}

module.exports.checkPassword = (password, hash, salt) => {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST_ALGO, (err, hashRaw) => {
      if (err) return reject(err);
      let compHash = new Buffer(hashRaw, 'binary').toString('hex');
      resolve(compHash === hash);
    })
  });
}

const REF_MATCH = /^#\/definitions\/(\w+)$/;
module.exports.schemaRefsToDBRefs = function(namespace, schema) {
  if (typeof schema !== 'object' || schema === null) return schema;
  if (schema.$ref) {
    const match = schema.$ref.match(REF_MATCH);
    if (match) {
      const type = match[1];
      return validate.getRefSchema(namespace, type)
    }
  }
  if (schema.properties) {
    for (let key in schema.properties) {
      schema.properties[key] = module.exports.schemaRefsToDBRefs(namespace, schema.properties[key]);
    }
  }
  if (schema.items) {
    schema.items = module.exports.schemaRefsToDBRefs(namespace, schema.items);
  }
  return schema
}

