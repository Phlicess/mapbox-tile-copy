var test = require('tape');
var exec = require('child_process').exec;
var path = require('path');

process.env.MapboxAPIMaps = 'https://api.tiles.mapbox.com';
var crypto = require('crypto');
var copy = path.resolve(__dirname, '..', 'bin', 'mapbox-tile-copy.js');
var bucket = process.env.TestBucket || 'tilestream-tilesets-development';
var runid = crypto.randomBytes(16).toString('hex');
var fixture = path.resolve(__dirname, 'fixtures', 'valid.serialtiles.gz');
var s3urls = require('s3urls');
var AWS = require('aws-sdk');

console.log('---> mapbox-tile-copy executable %s', runid);

function dsturi(name) {
  return [
    's3:/',
    bucket,
    'test/mapbox-tile-copy',
    runid,
    name,
    '{z}/{x}/{y}'
  ].join('/');
}

function tileCount(dst, callback) {
  var s3 = new AWS.S3();
  var count = 0;

  params = s3urls.fromUrl(dst.replace('{z}/{x}/{y}', ''));
  params.Prefix = params.Key;
  delete params.Key;

  function list(marker) {
    if (marker) params.Marker = marker;

    s3.listObjects(params, function(err, data) {
      if (err) return callback(err);
      count += data.Contents.length;
      if (data.IsTruncated) return list(data.Contents.pop().Key);
      callback(null, count);
    });
  }

  list();
}

test('invalid s3 url', function(t) {
  var dst = 'http://www.google.com';
  var cmd = [ copy, fixture, dst ].join(' ');
  exec(cmd, function(err, stdout, stderr) {
    t.ok(err, 'expected error');
    t.equal(stderr, 'You must provide a valid S3 url\n', 'expected message');
    t.equal(err.code, 1, 'exit code 1');
    t.end();
  });
});

test('file does not exist', function(t) {
  var dst = dsturi('invalid.file');
  var cmd = [ copy, '/w/t/f', dst ].join(' ');
  exec(cmd, function(err, stdout, stderr) {
    t.ok(err, 'expected error');
    t.equal(stderr, 'The file specified does not exist: /w/t/f\n', 'expected message');
    t.equal(err.code, 1, 'exit code 1');
    t.end();
  });
});

test('invalid source file', function(t) {
  var dst = dsturi('invalid.source');
  var fixture = path.resolve(__dirname, 'fixtures', 'invalid.tilejson');
  var cmd = [ copy, fixture, dst ].join(' ');
  exec(cmd, function(err, stdout, stderr) {
    t.ok(err, 'expected error');
    t.equal(stderr, 'Error: Unknown filetype.\n', 'expected message');
    t.equal(err.code, 3, 'exit code 3');
    t.end();
  });
});

test('s3 url', function(t) {
  var dst = dsturi('valid.s3url');
  var cmd = [ copy, fixture, dst ].join(' ');
  exec(cmd, function(err, stdout, stderr) {
    t.ifError(err, 'copied');
    t.equal(stdout.length, 64, 'expected stdout.length');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.equal(count, 4, 'expected number of tiles');
      t.end();
    });
  });
});

test('https s3 url', function(t) {
  var dst = dsturi('valid.httpurl');
  var cmd = [ copy, fixture, s3urls.convert(dst, 'bucket-in-host') ].join(' ');
  exec(cmd, function(err, stdout, stderr) {
    t.ifError(err, 'copied');
    t.equal(stdout.length, 64, 'expected stdout.length');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.equal(count, 4, 'expected number of tiles');
      t.end();
    });
  });
});

test('no progress', function(t) {
  var dst = dsturi('valid.noprogress');
  var cmd = [ copy, fixture, dst, '--withoutprogress' ].join(' ');
  exec(cmd, function(err, stdout, stderr) {
    t.ifError(err, 'copied');
    t.equal(stdout.length, 1, 'expected stdout.length');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.equal(count, 4, 'expected number of tiles');
      t.end();
    });
  });
});

test('parallel', function(t) {
  var dst = dsturi('valid.parallel');
  var cmd = [ copy, fixture, dst, '--part', '1', '--parts', '10' ].join(' ');
  exec(cmd, function(err, stdout, stderr) {
    t.ifError(err, 'copied');
    t.equal(stdout.length, 64, 'expected stdout.length');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.ok(count < 4, 'did not render all tiles');
      t.end();
    });
  });
});

test('part zero', function(t) {
  var dst = dsturi('valid.part.zero');
  var cmd = [ copy, fixture, dst, '--part', '0', '--parts', '10' ].join(' ');
  exec(cmd, function(err, stdout, stderr) {
    t.ifError(err, 'copied');
    t.equal(stdout.length, 64, 'expected stdout.length');
    tileCount(dst, function(err, count) {
      t.ifError(err, 'counted tiles');
      t.ok(count < 4, 'did not render all tiles');
      t.end();
    });
  });
});