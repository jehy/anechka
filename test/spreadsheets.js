/* eslint-disable no-underscore-dangle,no-console */

'use strict';

const rewire = require('rewire');
const config = require('config');
const {assert} = require('chai');

const spreadsheets = rewire('../modules/spreadsheets');

const mockData = require('./mockData/index');

async function getSpreadSheetMock({spreadsheetId, range})
{
  console.log('returning mocked spreadsheet');
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

class fsMock {
  static writeJson(file, data, options) {
    console.log(`mocked writing to file ${file}`);
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

describe('spreadsheets module', ()=>{
  let revertGoogleSpreadSheets;
  let revertConfig;
  let revertFs;
  let revertCaches;
  const caches = {users: {}, timeTables: {}};
  before(()=>{
    revertGoogleSpreadSheets = spreadsheets.__set__('getSpreadSheet', getSpreadSheetMock);
    config.timetables = testConfigTimetables;
    revertFs = spreadsheets.__set__('fs', fsMock);
    revertConfig = spreadsheets.__set__('config', {timetables: testConfigTimetables});
    revertCaches = spreadsheets.__set__('caches', caches);
  });
  after(()=>{
    revertGoogleSpreadSheets();
    revertFs();
    revertConfig();
    revertCaches();
  });
  it('should update users', async ()=>{
    await spreadsheets.updateUsers();
    // console.log(JSON.stringify(caches.users));
    const expected = {
      '1g1rbACDbFD-w8wwHeylSdiWrT5Vh47_JWT90Oh5-6CY': {
        Бондаренко: 'evgeny.bondarenko',
        Шабалкин: 'leonid.shabalkin',
        Шилов: 'vadim.shilov',
        Власов: 'pavel.vlasov',
        Кувшинов: 'evgeny.kuvshinov',
        Руденко: 'kirill.rudenko',
        Гнедин: 'pavel.gnedin',
      },
      lastUpdate: '2019-05-14T11:39:32.110Z',
    };
    caches.users.lastUpdate = expected.lastUpdate; // to avoid messing with timestamps
    assert.deepEqual(caches.users, expected);
  });
  it('should update timetables', async ()=>{
    await spreadsheets.updateTimeTables();
    // console.log(JSON.stringify(caches.timeTables));
    const expected = {
      '1g1rbACDbFD-w8wwHeylSdiWrT5Vh47_JWT90Oh5-6CY': {
        2019: {
          1: {
            1: 'Бондаренко',
            2: 'Бондаренко',
            3: 'Бондаренко',
            4: 'Бондаренко',
            5: 'Бондаренко',
            6: 'Бондаренко',
            7: 'Бондаренко',
            8: 'Бондаренко',
            9: 'Власов',
            10: 'Кувшинов',
            11: 'Бондаренко',
            14: 'Шилов',
            15: 'Шабалкин',
            16: 'Власов',
            17: 'Кувшинов',
            18: 'Бондаренко',
            21: 'Шилов',
            22: 'Шабалкин',
            23: 'Шилов',
            24: 'Кувшинов',
            25: 'Бондаренко',
            28: 'Шилов',
            29: 'Шабалкин',
            30: 'Власов',
            31: 'Кувшинов',
          },
          2: {
            1: 'Кувшинов',
            4: 'Шилов',
            5: 'Шабалкин',
            6: 'Власов',
            7: 'Бондаренко',
            8: 'Кувшинов',
            11: 'Шилов',
            12: 'Шабалкин',
            13: 'Власов',
            14: 'Бондаренко',
            15: 'Шилов',
            18: 'Кувшинов',
            19: 'Шабалкин',
            20: 'Бондаренко',
            21: 'Кувшинов',
            22: 'Шилов',
            25: 'Власов',
            26: 'Шабалкин',
            27: 'Бондаренко',
            28: 'Кувшинов',
          },
          3: {
            1: 'Шилов',
            4: 'Власов',
            5: 'Шабалкин',
            6: 'Власов',
            7: 'Бондаренко',
            8: 'Кувшинов',
            11: 'Шилов',
            12: 'Шабалкин',
            13: 'Власов',
            14: 'Бондаренко',
            15: 'Кувшинов',
            18: 'Шилов',
            19: 'Шабалкин',
            20: 'Власов',
            21: 'Бондаренко',
            22: 'Кувшинов',
            25: 'Шилов',
            26: 'Шабалкин',
            27: 'Власов',
            28: 'Кувшинов',
            29: 'Бондаренко',
          },
          4: {
            1: 'Шилов',
            2: 'Шабалкин',
            3: 'Власов',
            4: 'Кувшинов',
            5: 'Бондаренко',
            8: 'Шилов',
            9: 'Шабалкин',
            10: 'Власов',
            11: 'Бондаренко',
            12: 'Кувшинов',
            15: 'Шилов',
            16: 'Шабалкин',
            17: 'Власов',
            18: 'Бондаренко',
            19: 'Шилов',
            22: 'Шабалкин',
            23: 'Власов',
            24: 'Бондаренко',
            25: 'Шилов',
            26: 'Шабалкин',
            29: 'Власов',
            30: 'Бондаренко',
          },
          5: {
            1: 'Бондаренко',
            2: 'Бондаренко',
            3: 'Бондаренко',
            4: 'Бондаренко',
            5: 'Бондаренко',
            6: 'Шабалкин',
            7: 'Власов',
            8: 'Шилов',
            9: 'Бондаренко',
            10: 'Бондаренко',
            11: 'Бондаренко',
            12: 'Бондаренко',
            13: 'Шабалкин',
            14: 'Власов',
            15: 'Шилов',
            16: 'Бондаренко',
            17: 'Шабалкин',
            18: 'Бондаренко',
            19: 'Бондаренко',
            20: 'Власов',
            21: 'Шилов',
            22: 'Бондаренко',
            23: 'Шабалкин',
            24: 'Власов',
            25: 'Бондаренко',
            26: 'Бондаренко',
            27: 'Шилов',
            28: 'Бондаренко',
            29: 'Шабалкин',
            30: 'Власов',
            31: 'Шилов',
          },
        },
      },
      lastUpdate: '2019-05-14T11:39:32.124Z',
    };
    caches.timeTables.lastUpdate = expected.lastUpdate; // to avoid messing with timestamps
    assert.deepEqual(caches.timeTables, expected);
  });

});
