'use strict';

const Debug = require('debug');

const debug = Debug('anechka:test');
Debug.enable('anechka:test');

class logMock
{
  static error(...args)
  {
    debug('ERROR', args);
  }

  static info(...args)
  {
    debug('INFO', args);
  }

  static warn(...args)
  {
    debug('INFO', args);
  }
}


class fsMock {
  static writeJson(file, data, options) {
    debug(`mocked writing to file ${file}`);
  }
}


const testConfigTimetables = [
  {
    spreadsheetId: '1g1rbACDbFD-w8wwHeylSdiWrT5Vh47_JWT90Oh5-6CY',
    prefix: '',
    updateTime: '17:54:30',
    devIndex: 1,
    group: 'GCC9TQ0JW',
    name: 'test 1 channel update',
  },
];

module.exports = {
  logMock,
  fsMock,
  testConfigTimetables,
};
