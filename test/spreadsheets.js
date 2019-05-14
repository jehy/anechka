/* eslint-disable no-underscore-dangle */

'use strict';

const rewire = require('rewire');
const config = require('config');
const {assert} = require('chai');
const Debug = require('debug');

const debug = Debug('anechka:test');
Debug.enable('anechka:test');

const spreadsheets = rewire('../modules/spreadsheets');

const mockData = require('./mockData/index');
const {logMock, fsMock, testConfigTimetables} = require('./utils');

async function getSpreadSheetMock({spreadsheetId, range})
{
  debug('returning mocked spreadsheet');
  if (range.startsWith('timetable'))
  {
    return mockData.spreadsheets.timetable;
  }
  if (range.startsWith('users'))
  {
    return mockData.spreadsheets.users;
  }
  throw new Error(`Unknown spreadsheet ${range}`);
}

describe('spreadsheets module', ()=>{
  let revertGoogleSpreadSheets;
  let revertConfig;
  let revertFs;
  let revertCaches;
  let revertInit;
  let revertLogger;
  const caches = {users: {}, timeTables: {}};
  before(()=>{
    revertGoogleSpreadSheets = spreadsheets.__set__('getSpreadSheet', getSpreadSheetMock);
    revertLogger = spreadsheets.__set__('log', logMock);
    config.timetables = testConfigTimetables;
    revertFs = spreadsheets.__set__('fs', fsMock);
    revertConfig = spreadsheets.__set__('config', {timetables: testConfigTimetables});
    revertCaches = spreadsheets.__set__('caches', caches);
    revertInit = spreadsheets.__set__('initSpreadSheets', ()=>{});
  });
  after(()=>{
    revertGoogleSpreadSheets();
    revertFs();
    revertConfig();
    revertCaches();
    revertInit();
    revertLogger();
  });
  it('should update users', async ()=>{
    const res = await spreadsheets.updateUsers();
    assert.equal(res, true);
    caches.users.lastUpdate = mockData.spreadsheets.usersExpected.lastUpdate; // to avoid messing with timestamps
    assert.deepEqual(caches.users, mockData.spreadsheets.usersExpected);
  });
  it('should update timetables', async ()=>{
    const res = await spreadsheets.updateTimeTables();
    assert.equal(res, true);
    caches.timeTables.lastUpdate = mockData.spreadsheets.timetableExpected.lastUpdate; // to avoid messing with timestamps
    assert.deepEqual(caches.timeTables, mockData.spreadsheets.timetableExpected);
  });

});
