/* jslint node: true */

'use strict';

require('./enforce_singleton.js');

const EventEmitter = require('events').EventEmitter;

const eventEmitter = new EventEmitter();
eventEmitter.setMaxListeners(20);

module.exports = eventEmitter;