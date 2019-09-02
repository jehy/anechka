'use strict';

function transpose(a) {
  return Object.keys(a[0]).map((c) => a.map((r) => r[c]));
}

function timeTableHash(timetable) {
  return `${timetable.spreadsheetId}${timetable.prefix}`;
}

function userTimeTableHash(timetable) {
  return `${timetable.spreadsheetId}`;
}

module.exports = {
  transpose,
  timeTableHash,
  userTimeTableHash,
};
