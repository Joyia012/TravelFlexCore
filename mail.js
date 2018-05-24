'use strict';
var conf = require('./conf.js');

if (conf.smtpTransport === 'direct' && !(typeof window !== 'undefined' && window && window.cordova)) {
    console.log('dummy mail');
}

if (conf.smtpTransport === 'relay' && !conf.smtpRelay)
    console.log('dummy mail');

function sendmail(params, cb){
    console.log('dummy');
}

function sendMailThroughUnixSendmail(params, cb){
    console.log('dummy');
}

function sendMailDirectly(params, cb) {
    console.log('dummy');
}

function sendMailThroughRelay(params, cb){
    console.log('dummy');
}

function sendBugEmail(error_message, exception){
    console.log('dummy');
}

exports.sendmail = sendmail;
exports.sendBugEmail = sendBugEmail;