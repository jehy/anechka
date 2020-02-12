/* eslint-disable no-underscore-dangle */

'use strict';

const rewire = require('rewire');
const {assert} = require('chai');
const Debug = require('debug');
const sinon = require('sinon');

const debug = Debug('anechka:test');
Debug.enable('anechka:test');

const spreadsheets = rewire('../modules/spreadsheets');

const mockData = require('./mockData/index');
const {
  bunyanMock,
  logMock,
  fsMock,
  testConfigTasks,
} = require('./utils');

async function getSpreadSheetMock({spreadsheetId, range}) {
  debug('returning mocked spreadsheet');
  if (range.startsWith('timetable')) {
    return mockData.spreadsheets.timetable;
  }
  if (range.startsWith('users')) {
    return mockData.spreadsheets.users;
  }
  throw new Error(`Unknown spreadsheet ${range}`);
}

describe('spreadsheets module', ()=>{
  let revertGoogleSpreadSheets;
  let revertFs;
  let revertCaches;
  let revertInit;
  let revertBunyan;
  let revertLog;
  let revertConfig;
  const caches = {users: {}, timeTables: {}};
  let clock;
  before(()=>{
    revertGoogleSpreadSheets = spreadsheets.__set__('getSpreadSheet', getSpreadSheetMock);
    revertBunyan = spreadsheets.__set__('bunyan', bunyanMock);
    revertFs = spreadsheets.__set__('fs', fsMock);
    revertCaches = spreadsheets.__set__('caches', caches);
    revertInit = spreadsheets.__set__('initSpreadSheets', ()=>{});
    revertLog = spreadsheets.__set__('log', logMock);
    revertConfig = spreadsheets.__set__('config', {tasks: testConfigTasks});
    clock = sinon.useFakeTimers(Date.parse('02 Jan 2019 00:00:00 GMT'));
  });
  after(()=>{
    revertGoogleSpreadSheets();
    revertFs();
    revertCaches();
    revertInit();
    revertBunyan();
    revertLog();
    revertConfig();
    clock.restore();
  });
  it('should update users', async ()=>{
    const res = await spreadsheets.fetchUsers();
    assert.equal(res, true);
    caches.users.lastUpdate = mockData.spreadsheets.usersExpected.lastUpdate; // to avoid messing with timestamps
    assert.deepEqual(caches.users, mockData.spreadsheets.usersExpected);
  });
  it('should update timetables', async ()=>{
    const res = await spreadsheets.fetchTimeTables();
    assert.equal(res, true);
    caches.timeTables.lastUpdate = mockData.spreadsheets.timetableExpected.lastUpdate; // to avoid messing with timestamps
    assert.deepEqual(caches.timeTables, mockData.spreadsheets.timetableExpected);
  });

});
