# Anechka


![Build](https://github.com/jehy/anechka/workflows/Build/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/jehy/anechka/badge.svg?branch=master)](https://coveralls.io/github/jehy/anechka?branch=master)
[![dependencies Status](https://david-dm.org/jehy/anechka/status.svg)](https://david-dm.org/jehy/anechka)
[![devDependencies Status](https://david-dm.org/jehy/anechka/dev-status.svg)](https://david-dm.org/jehy/anechka?type=dev)
[![Known Vulnerabilities](https://snyk.io/test/github/jehy/anechka/badge.svg)](https://snyk.io/test/github/jehy/anechka)

`Anechka` is a bot which looks up google spreadsheets, finds someone who is on
duty today and sets channel topic with his nick. You can have several
timetables for different groups and channels.

## Requirements

* slack bot credentials
* google api credentials
* spreadsheet in definite format (see below)


## Config

* `credentials.json` - credentials from google
* `token.json` - token from google which you get after auth
* `runtime.json` - config which overrides `default.json`.

Please copy it from `default.json`. It looks like this:

```json
{
  "tasks": [
    {
      "spreadsheetId": "qwoeifh;wiorhfilrhgilrh",
      "prefix": "_dev",
      "updateTime": "17:54:30",
      "devIndex": 1,
      "conversation": "GAC9TQ04W",
      "name": "dev update"
    },
    {
      "spreadsheetId": "234trw34te4srgt",
      "prefix": "_ops",
      "updateTime": "17:54:30",
      "devIndex": 0,
      "conversation": "1CDATR2CX",
      "name": "ops update"
    }
  ],
  "token": "zzz",
  "updateInterval": 10,
  "admin": "ivan.petrov"
}

```

`admin` is slack login of user which is used to send all kind of error reports.

Slack data is updated every hour, and timetable data is updated every 30 minutes.
It is hardcoded for now.

## Spreadsheet format

### Timetable

Spreadsheet should have a sheet which is called `timetable_${prefix}${year}`.
There you have timetable itself, in format like:

| A |    B     | C |    D     |   |
|---|----------|---|----------|---|
| 6 | June     | 7 | July     |   |
|   |          |   |          |   |
| 1 | devName1 | 4 | devName3 |   |
| 2 | devName2 | 5 | devName4 |   |

Please note that month number is required but month title is not neccessary.

Months and particular dates (for example holidays) can be skipped - then
bot just does nothing.

### Users

Also spreadsheet should have a sheet "users" which links
names from timetable to slack names, it looks like this:

|     A    |          B             |       C      |
|----------|------------------------|--------------|
| devName1 | dev1SlackLogin         |   owner      |
| devName2 | dev2SlackLogin         |              |

Value `owner` is third column is used to send error reports for this timetable's owner.

## FAQ

* `current` directory is used to store cache contents - it is useful for debug.
