/* jslint node: true */

'use strict';

const async = require('async');
const constants = require('./constants.js');
const conf = require('./conf.js');
const objectHash = require('./object_hash.js');
const ValidationUtils = require('./validation_utils.js');
const eventBus = require('./event_bus.js');
const db = require('./db.js');
const storage = require('./storage.js');

/*
 returns objPrivateProfile {
 unit: "...", // attestation unit
 payload_hash: "...", // pointer to attestation payload in this unit
 src_profile: object // attested fields
 }
 */
function getPrivateProfileFromJsonBase64(privateProfileJsonBase64) {
  const privateProfileJson = Buffer(privateProfileJsonBase64, 'base64').toString('utf8');
  console.log(privateProfileJson);
  try {
    var objPrivateProfile = JSON.parse(privateProfileJson);
  } catch (e) {
    return null;
  }
  if (!ValidationUtils.isStringOfLength(objPrivateProfile.unit, constants.HASH_LENGTH) || !ValidationUtils.isStringOfLength(objPrivateProfile.payload_hash, constants.HASH_LENGTH) || typeof objPrivateProfile.src_profile !== 'object') { return null; }
  return objPrivateProfile;
}

function parseAndValidatePrivateProfile(objPrivateProfile, onDone) {
  function handleJoint(objJoint) {
    const attestor_address = objJoint.unit.authors[0].address;
    let payload;
    objJoint.unit.messages.forEach((message) => {
      if (message.app !== 'attestation' || message.payload_hash !== objPrivateProfile.payload_hash) { return; }
      payload = message.payload;
    });
    if (!payload) { return onDone('no such payload hash in this unit'); }
    const hidden_profile = {};
    let bHasHiddenFields = false;
    for (let field in objPrivateProfile.src_profile) {
      const value = objPrivateProfile.src_profile[field];
      // the value of each field is either array [plain_text_value, blinding] (if the field is disclosed) or a hash (if it is not disclosed)
      if (ValidationUtils.isArrayOfLength(value, 2)) { hidden_profile[field] = objectHash.getBase64Hash(value); } else if (ValidationUtils.isStringOfLength(value, constants.HASH_LENGTH)) {
        hidden_profile[field] = value;
        bHasHiddenFields = true;
      } else { return onDone('invalid src profile'); }
    }
    if (objectHash.getBase64Hash(hidden_profile) !== payload.profile.profile_hash) { return onDone('wrong profile hash'); }
    db.query(
      'SELECT 1 FROM my_addresses WHERE address=? UNION SELECT 1 FROM shared_addresses WHERE shared_address=?',
      [payload.address, payload.address],
      (rows) => {
        let bMyAddress = (rows.length > 0);
        if (bMyAddress && bHasHiddenFields) {
          console.log('profile of my address but has hidden fields');
          bMyAddress = false;
        }
        onDone(null, payload.address, attestor_address, bMyAddress);
      }
    );
  }
  storage.readJoint(db, objPrivateProfile.unit, {
    ifNotFound() {
      eventBus.once(`saved_unit-${objPrivateProfile.unit}`, handleJoint);
      const network = require('./network.js');
      if (conf.bLight) { network.requestHistoryFor([objPrivateProfile.unit], []); }
    },
    ifFound: handleJoint
  });
}

// removes blinding and returns object {first_name: "First", last_name: "Last", ...}
function parseSrcProfile(src_profile) {
  const assocPrivateData = {};
  for (let field in src_profile) {
    const arrValueAndBlinding = src_profile[field];
    if (ValidationUtils.isArrayOfLength(arrValueAndBlinding, 2)) // otherwise it is a hash, meaning that the field was not disclosed
      { assocPrivateData[field] = arrValueAndBlinding[0]; }
  }
  return assocPrivateData;
}

// the profile can be mine or peer's
function savePrivateProfile(objPrivateProfile, address, attestor_address, onDone) {
  db.query(
    `INSERT ${db.getIgnore()} INTO private_profiles (unit, payload_hash, attestor_address, address, src_profile) VALUES(?,?,?,?,?)`,
    [objPrivateProfile.unit, objPrivateProfile.payload_hash, attestor_address, address, JSON.stringify(objPrivateProfile.src_profile)],
    (res) => {
      const private_profile_id = res.insertId;
      if (!private_profile_id) { throw Error(`no insert id after inserting private profile ${JSON.stringify(objPrivateProfile)}`); }
      const arrQueries = [];
      for (let field in objPrivateProfile.src_profile) {
        const arrValueAndBlinding = objPrivateProfile.src_profile[field];
        db.addQuery(arrQueries, 'INSERT INTO private_profile_fields (private_profile_id, field, value, blinding) VALUES(?,?,?,?)',
          [private_profile_id, field, arrValueAndBlinding[0], arrValueAndBlinding[1]]);
      }
      async.series(arrQueries, onDone);
    }
  );
}

exports.getPrivateProfileFromJsonBase64 = getPrivateProfileFromJsonBase64;
exports.parseAndValidatePrivateProfile = parseAndValidatePrivateProfile;
exports.parseSrcProfile = parseSrcProfile;
exports.savePrivateProfile = savePrivateProfile;

