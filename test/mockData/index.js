'use strict';

const deepFreeze = require('deep-freeze');
const spreadsheets = require('./spreadSheets/index');
const slack = require('./slack/index');

const data = {
  spreadsheets,
  slack,
};
deepFreeze(data);

module.exports = data;
