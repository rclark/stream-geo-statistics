var through2 = require('through2');
var SphericalMercator = require('sphericalmercator');
var StatisticsStream = require('stream-statistics');
var spherical = require('spherical');
var _ = require('underscore');

module.exports = function(options) {
    // Configurables:
    options = options || {};
    var maxZoom = options.maxZoom ? Math.min(options.maxZoom, 20) : false;
    var tileSize = options.tileSize || 256;

    var geoStats = through2.obj(function(feature, enc, callback) {
        // Create the underlying stats object if it doesn't exist
        if (!this._stats) {
            this._stats = {
                bbox: null,                         // BBOX for all features
                density: StatisticsStream(),        // Distances between coordinates across all features
                duplicates: StatisticsStream(),     // Duplicate coordinates per feature
                coordinates: StatisticsStream(),    // Number of coordinates per feature
                features: 0,                        // Just a running count                
            };
            // Only do tiles if a maxZoom was set
            if (maxZoom) this._stats.tiles = [];
        }

        // Increment number of features
        this._stats.features++;

        // Flatten any geometry into an array of coordinates
        var coords = (function(geom) {
            var type = geom.type;
            var coords = geom.coordinates;
            if (type === 'Point') return [coords];
            if (type === 'MultiPoint' || type === 'LineString') return coords;
            if (type === 'MultiLineString' || 'Polygon') return _(coords).flatten(true);
            if (type === 'MultiPolygon') return _(coords).chain().flatten(true).flatten(true).value();
        })(feature.geometry);

        // Add a data point for number of coordinates
        this._stats.coordinates.write(coords.length);

        // Get coordinate density and duplicate inforamation
        var numDuplicates = 0;
        coords.forEach(function(coord, index, coordinates) {
            if (index > 0) {
                var d = 0;
                var prev = coordinates[index - 1];
                
                if (prev[0] === coord[0] && prev[1] === coord[1]) numDuplicates++;
                else d = spherical.distance(prev, coord);

                geoStats._stats.density.write(d);
            }
        });
        this._stats.duplicates.write(numDuplicates);

        // Get this feature's bbox
        var featureBbox = getBbox(coords);

        if (maxZoom) {
            // Add this feature's tiles to the tilelist, then dedupe
            // These are by far the most costly operations
            this._stats.tiles = getTiles(featureBbox, maxZoom, tileSize, this._stats.tiles);
            this._stats.tiles = _(this._stats.tiles).uniq();
        }

        // Add existing bbox coords to the list and calculate the running bbox
        if (this._stats.bbox) {
            coords = _(coords).concat([
                [this._stats.bbox[0], this._stats.bbox[1]], 
                [this._stats.bbox[2], this._stats.bbox[3]]
            ]);
            this._stats.bbox = getBbox(coords);
        } else {
            this._stats.bbox = featureBbox;
        }
        
        // Pass the feature through un-changed and continue the stream
        this.push(feature);
        callback();
    });

    // Additional API function to get the underlying statistics object
    geoStats.getStats = function() {
        var stats = {
            bbox: geoStats._stats.bbox,
            density: geoStats._stats.density._stats,
            duplicates: geoStats._stats.duplicates._stats,
            coordinates: geoStats._stats.coordinates._stats,
            features: geoStats._stats.features
        };
        if (geoStats._stats.tiles) stats.tiles = geoStats._stats.tiles;
        return stats;
    }

    return geoStats;
}

function getBbox(coords) {
    // Pluck all the xCoords and all the yCoords
    var xAll = [], yAll = [];
    coords.forEach(function(coord) {
        xAll.push(coord[0]);
        yAll.push(coord[1]);
    });

    // Sort all the coords
    xAll = xAll.sort(function (a,b) { return a - b });
    yAll = yAll.sort(function (a,b) { return a - b });

    // Return the bbox
    return [xAll[0], yAll[0], xAll[xAll.length - 1], yAll[yAll.length - 1]];
}

function getTiles(bbox, maxZoom, tileSize, appendTo) {
    var zooms = _(maxZoom + 1).range();
    var sm = new SphericalMercator({size: tileSize});
    appendTo = appendTo || [];

    // Generate tile lists
    return zooms.reduce(function(memo, z) {
        var bounds = sm.xyz(bbox, z);
        for (var x = bounds.minX; x < bounds.maxX + 1; x++) {
            for (var y = bounds.minY; y < bounds.maxY + 1; y++) {
                memo.push([z, x, y].join('/'));
            }
        }
        return memo
    }, appendTo);
}