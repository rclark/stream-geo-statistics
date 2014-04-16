# stream-geo-statistics

A way to calculate geographic statistics about a set of GeoJSON features. This module presents you with a transparent pass-through stream that calculates statistics as you pass objects into it. This allows the module to fit in a processing or transformation pipeline and calculate statistics without getting in the way.

## Example

```javascript
var geoStatistics = require('stream-geo-statistics');
var geojsonStream = require('geojson-stream');
var myPipeline = require('./the-rest-of-my-pipeline');
var fs = require('fs');

fs.createReadStream('my-feature-collection.geojson')
    .pipe(geojsonStream.parse()) // Processes file as discrete features
    .pipe(geoStatistics())       // Collects statistics and passes features through
    .pipe(myPipeline);           // Recieves features and does whatever to them

myPipeline.on('finish', function() {
    var stats = geoStatistics.getStats();    
});
```
## Usage

- You must stream in discrete GeoJSON features, not a stringified representation of a FeatureCollection. [geojson-stream](https://github.com/tmcw/geojson-stream) can help.

- Calling `.getStats()` will return an object with the following keys:
    - `bbox`: as and array of `[ east, south, west, north ]` for all features
    - `density`: as statistics on the distance between coordinates for all features
    - `duplicates`: as statistics on the number of duplicate coordinates per feature
    - `coordinates`: as statistics on the number of coordinates per feature
    - `features`: the number of features that have come through
    - `tiles`: spherical-mercator tiles as an array of `[ "z/x/y" ]` covering all features

- Each "statistics" object (e.g. `coordinates`) is data collected from a [stream-statistics](https://github.com/tmcw/stream-statistics) object that presents min, max, sum, mean, mode, variance, standard_deviation, geometric_mean and harmonic_mean.

## Options

Calculating tile lists is currently the most expensive operation by far. So, if you do not specifically ask for it, tile lists are not generated. In order to generate tile lists, you must pass an `options` object when creating your statistics stream. For example:

```javascript
var geoStatistics = require('stream-geo-statistics');
var myStream = geoStatistics({
    maxZoom: 14,    // must be provided in order to generate tile lists
    tileSize: 512   // optional, defaults to 256
});
```