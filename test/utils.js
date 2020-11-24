'use strict';

const Debug = require('debug');

const debug = Debug('anechka:test');
Debug.enable('anechka:test');

class logMock {
  static error(...args) {
    debug('ERROR', args);
  }

  static info(...args) {
    debug('INFO', args);
  }

  static warn(...args) {
    debug('INFO', args);
  }
}

class fsMock {
  static writeJson(file, data, options) {
    debug(`mocked writing to file ${file}`);
  }
}

const testConfigTasks = [
  {
    spreadsheetId: 'id',
    prefix: '',
    updateTime: '17:54:30',
    devIndex: 1,
    conversation: 'test1',
    name: 'test 1 channel update',
  },
];

class bunyanMock {
  static createLogger() {
    return logMock;
  }
}

module.exports = {
  logMock,
  fsMock,
  testConfigTasks,
  bunyanMock,
};
