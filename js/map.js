var map;
var paths = {}, tempPaths = {};
var markers = {};
var startEndPositions = {};

var markerRed, markerShadow;

$(document).ready(function($) {
	initializeMap();

	$("#loginbox").submit(function() {
		login($("#username").val(), $("#password").val());
		return false;
	});

	$('#stationbox .close').click(function() {
		$('#stationbox').hide();
		clearTempPaths();
	});

	$('#routebox .close').click(function() {
		$('#routebox').hide();
		clearTempPaths();
	});

	$('#popularstations .close').click(function() {
		$('#popularstations').hide();
	});

	showDemoData();
});

var calculateGlobalStats = function(rentals)
{
	// 5 most frequently used stations
	var stationsByVisits = [];

	$.each(rentals, function(index, rental) {
		if (!stationsByVisits[rental.start_station])
			stationsByVisits[rental.start_station] = 1;
		else
			stationsByVisits[rental.start_station]++;

		if (!stationsByVisits[rental.end_station])
			stationsByVisits[rental.end_station] = 1;
		else
			stationsByVisits[rental.end_station]++;
	});

	var stationsByVisitsSorted = [];
	for (var station in stationsByVisits)
		stationsByVisitsSorted.push([station, stationsByVisits[station]])
	stationsByVisitsSorted.sort(function(a, b) {return a[1] - b[1]})
	stationsByVisitsSorted.reverse();


	for (var i = 0; i < 5; i++) {
		if (typeof(stationsByVisitsSorted[i]) == 'undefined')
			break;

		$('#popularstations ul').append('<li><strong>' + stationsByVisitsSorted[i][1] + ' time' + (stationsByVisitsSorted[i][1] == 1 ? '' : 's') + '</strong> ' + stationsByVisitsSorted[i][0] + '</li>');
	}

	// Last station used
	$('#last-station p').html(rentals[0].end_station + '<span>' + rentals[0].end_date + '</span>');
	
	// First station used
	$('#first-station p').html(rentals[rentals.length - 1].end_station + '<span>' + rentals[rentals.length - 1].end_date + '</span>');

	// Average trip duration
	// Longest trip (o)
	// Shortest trip (o)
	var totalDuration = 0;
	var longestDuration = 0;
	var shortestDuration = Number.MAX_VALUE;
	$.each(rentals, function(index, rental) {
		totalDuration += rental.duration_seconds;

		if (rental.duration_seconds < shortestDuration) {
			shortestDuration = rental.duration_seconds;
		}

		if (rental.duration_seconds > longestDuration) {
			longestDuration = rental.duration_seconds;
		}
	});

	var averageDuration = totalDuration / rentals.length;
	$('#average-trip-duration p').html(formatTime(Math.round(averageDuration)));
	$('#longest-trip p').html(formatTime(longestDuration));
	$('#fastest-trip p').html(formatTime(shortestDuration));

	// Average number of trips per day
	var startDate = rentals[rentals.length - 1].start_date;
	var endDate = rentals[0].end_date;
	var diff = dateDiff(startDate, endDate);
	var tripsPerDay = diff.d / rentals.length;

	$('#average-per-day p').html(tripsPerDay.toFixed(2));

	/*
	Average trip distance
	Longest trip (miles)
	Shortest trip (miles)
	*/
}

var showDemoData = function () {
    $("#loading").show();

	$.ajax({
        type: "GET",
        url: "/demo",
        dataType: 'json',
        async: true,
        success: function(data) {
        	$("#loading").hide();
        	showStations(data);
        }
    });
}

var login = function(username, password)
{
	$("#loginbox").hide();
    $("#loading").show();

	$.ajax({
        type: "GET",
        url: "/rentals",
        dataType: 'json',
        async: false,
        username: username,
        password: password,
        success: function(data) {
            if (data.error) {
                alert(data.error);
                $("#loginbox").show();
            } else {
                showStations(data);
            }
        }
    }).fail(function (response) {
        $("#loginbox").show();

    	if (response.status == 401) {
    		alert('Invalid username/password, please try again.');
    	} else {
    		alert('An unknown error occurred');
    	}
    }).always(function() {
    	$("#loading").hide();
    });
}

var initializeMap = function()
{
	markerRed = new google.maps.MarkerImage(
		"https://maps.gstatic.com/mapfiles/ridefinder-images/mm_20_red.png",
		new google.maps.Size(12, 20),
		new google.maps.Point(0, 0),
		new google.maps.Point(6, 20));
	markerShadow = new google.maps.MarkerImage(
		"https://maps.gstatic.com/mapfiles/ridefinder-images/mm_20_shadow.png",
		new google.maps.Size(22, 20),
		new google.maps.Point(0, 0),
		new google.maps.Point(6, 20));

	var styles = [];

    var styledMap = new google.maps.StyledMapType(styles, { name: "Map" });

	var mapOptions = {
		zoom: 14,
		center: new google.maps.LatLng(38.8951118, -77.0363658),
		mapTypeControlOptions: {
			mapTypeIds: ['map_style']
		},
		mapTypeControl: false,
	    panControl: false,
	    zoomControl: true,
	    zoomControlOptions: {
	        style: google.maps.ZoomControlStyle.SMALL,
	        position: google.maps.ControlPosition.LEFT_TOP
	    },
	    scaleControl: false,
	    streetViewControl: false
	};
	map = new google.maps.Map(document.getElementById('map'), mapOptions);

	map.mapTypes.set('map_style', styledMap);
	map.setMapTypeId('map_style');
}

var createMarker = function(latLng)
{
	if (!markers[latLng])
	{
		var marker = new google.maps.Marker({
			position: latLng,
			map: map,
			animation: google.maps.Animation.DROP,
			icon: markerRed,
			shadow: markerShadow
		});

		google.maps.event.addListener(marker, 'click', markerClicked);
		markers[latLng] = marker;
	}
}

var showStations = function(rentals)
{
	// Clear the "drawing board"
	startEndPositions = {};
	clearMarkers();
	clearPaths();
	clearTempPaths();
	$('#stationbox').hide();

	// Calculate global stats
	calculateGlobalStats(rentals);

	$.each(rentals, function(index, rental) {
		if (typeof(rental.start_station_loc) != 'undefined' && typeof(rental.end_station_loc) != 'undefined') {
			// Determine location points
			var startPos = new google.maps.LatLng(rental.start_station_loc[0], rental.start_station_loc[1]);
			var endPos = new google.maps.LatLng(rental.end_station_loc[0], rental.end_station_loc[1]);
			
			// Create start and end marker
			createMarker(startPos);
			createMarker(endPos);

			// Create path between markers
			addPath(rental, startPos, endPos);
		} else {
			//console.log('Rental info not complete:', rental)
		}
	});
}

var markerClicked = function(marker)
{
	var stationName;

	// Mark paths to and from station
	clearTempPaths();
	var positions = startEndPositions[marker.latLng];
	$.each(positions, function(index, rental) {
		var startLoc = new google.maps.LatLng(rental.start_station_loc[0], rental.start_station_loc[1]);
		var endLoc = new google.maps.LatLng(rental.end_station_loc[0], rental.end_station_loc[1]);

		if (marker.latLng.equals(startLoc)) {
			stationName = rental.start_station;
			position = endLoc;
		} else {
			stationName = rental.end_station;
			position = startLoc;
		}

		addTempPath(marker.latLng, position);
	});

	// Show information about station
	$('#stationbox').show();
	$('#stationbox h2').html(stationName);

	$('#stationbox .trips-count p').html(positions.length);

	var desc;

	// First time used
	var firstRental = positions[positions.length - 1];

	if (firstRental.start_station == stationName) {
		desc = '<i class="icon-arrow-right" title="Going to"></i> ' + firstRental.end_station;
	} else {
		desc = '<i class="icon-arrow-left" title="Coming from"></i> ' + firstRental.start_station;
	}
	$('#stationbox .first-time p').html(desc + '<span>'+ firstRental.start_date +'</span>');
	
	// Last time used
	var lastRental = positions[0];

	if (lastRental.start_station == stationName) {
		desc = '<i class="icon-arrow-right" title="Going to"></i> ' + lastRental.end_station;
	} else {
		desc = '<i class="icon-arrow-left" title="Coming from"></i> ' + lastRental.start_station;
	}
	$('#stationbox .last-time p').html(desc + '<span>'+ lastRental.start_date +'</span>');
	
}

var clearPaths = function()
{
	$.each(paths, function(key, value) {
		value.setMap(null);
	});
	paths = {};	
}

var clearMarkers = function()
{
	$.each(markers, function(key, value) {
		value.setMap(null);
	});
	markers = {};	
}

var addPath = function(rental, startPos, endPos)
{
	// Add path in both directions to positions list
	if (!startEndPositions[startPos])
		startEndPositions[startPos] = new Array();
	startEndPositions[startPos].push(rental);

	if (!startEndPositions[endPos])
		startEndPositions[endPos] = new Array();
	startEndPositions[endPos].push(rental);

	var pos = startPos + ',' + endPos;
	var posReverse = endPos + ',' + startPos;

	if (!paths[pos] && !paths[posReverse])
	{
		var bikePath = new google.maps.Polyline({
			path: [startPos, endPos],
			strokeColor: "#FF0000",
			strokeOpacity: 0.5,
			strokeWeight: 1,
			map: map
		});

		// Save path
		paths[pos] = bikePath;
	}
}

var clearTempPaths = function()
{
	$.each(tempPaths, function(key, value) {
		value.setMap(null);
	});
	tempPaths = {};
}

var addTempPath = function(startPos, endPos)
{
	var pos = startPos + ',' + endPos;
	var posReverse = endPos + ',' + startPos;

	if (!tempPaths[pos] && !tempPaths[posReverse])
	{
		var bikePath = new google.maps.Polyline({
			path: [startPos, endPos],
			strokeColor: "#0000FF",
			strokeOpacity: 1.0,
			strokeWeight: 5,
			map: map
		});

		google.maps.event.addListener(bikePath, 'click', function() {
			// Hide station box
			$('#stationbox').hide();
    		clearTempPaths();

    		// Restore path with distinct color
    		bikePath.setMap(map);
    		bikePath.setOptions({
    			strokeWeight: 10
    		});
    		tempPaths[pos] = bikePath;

    		// Show route box
    		$('#routebox').show();

    		// Find all rentals where both start and end station is for this route
    		var allPositions = startEndPositions[startPos].concat(startEndPositions[endPos]);
    		var routeRentals = [];
			var totalDuration = 0;
			var longestDuration = 0;
			var shortestDuration = Number.MAX_VALUE;
			var usedDates = {};

    		$.each(allPositions, function(index, rental) {
				var startLoc = new google.maps.LatLng(rental.start_station_loc[0], rental.start_station_loc[1]);
				var endLoc = new google.maps.LatLng(rental.end_station_loc[0], rental.end_station_loc[1]);

				if (((startPos.equals(startLoc) && endPos.equals(endLoc)) || (endPos.equals(startLoc) && startPos.equals(endLoc))) && !usedDates[rental.start_date])
				{
					routeRentals.push(rental);
					usedDates[rental.start_date] = true; // Keep track of rentals that has already been pushed

					// Track duration stats
					totalDuration += rental.duration_seconds;

					if (rental.duration_seconds < shortestDuration) {
						shortestDuration = rental.duration_seconds;
					}

					if (rental.duration_seconds > longestDuration) {
						longestDuration = rental.duration_seconds;
					}
				}
			});

			// First time used
			var firstRental = routeRentals[routeRentals.length - 1];

			var desc = '<i class="icon-arrow-left" title="Coming from"></i> ' + firstRental.start_station;
			$('#routebox .first-time p').html(firstRental.start_date);
			
			// Last time used
			var lastRental = routeRentals[0];
			desc = '<i class="icon-arrow-left" title="Coming from"></i> ' + lastRental.start_station;
			$('#routebox .last-time p').html(lastRental.start_date);

			// Station names
			$('#routebox h2').html(firstRental.start_station + ' <i class="icon-resize-horizontal"></i> ' + firstRental.end_station);

			// Number of trips between these two stations
			$('#routebox .trips-count p').html(routeRentals.length);

			// Average trip duration
			// Longest trip (o)
			// Shortest trip (o)
			var averageDuration = totalDuration / routeRentals.length;
			$('#routebox .average-trip p').html(formatTime(Math.round(averageDuration)));
			$('#routebox .slowest-trip p').html(formatTime(longestDuration));
			$('#routebox .fastest-trip p').html(formatTime(shortestDuration))

			generateTimeline(routeRentals, longestDuration, shortestDuration);
		});

		// Save path
		tempPaths[pos] = bikePath;
	}
}

var generateTimeline = function(rentals, longestDuration, shortestDuration)
{
	var data = new google.visualization.DataTable();
	data.addColumn('date', 'Date');
	data.addColumn('number', 'Trip duration (minutes)');
	data.addColumn('string', 'title1');
	data.addColumn('string', 'text1');

	$.each(rentals, function(index, rental) {
		var title = null;
		var text = null;

		if (rental.duration_seconds == longestDuration) {
			title = 'Slowest trip';
			text = formatTime(rental.duration_seconds);
		} else if (rental.duration_seconds == shortestDuration) {
			title = 'Fastest trip';
			text = formatTime(rental.duration_seconds);
		}

		data.addRow([
			parseDate(rental.start_date),
			rental.duration_seconds / 60,
			title,
			text
		]);
	});

	var annotatedtimeline = new google.visualization.AnnotatedTimeLine(document.getElementById('timelinechart'));
	annotatedtimeline.draw(data, {'displayAnnotations': true});
}

// Example input: 12-16-2012 12:02 am
var parseDate = function(strDate)
{
	var dateTimeParts = strDate.split(" ");
	var dateParts = dateTimeParts[0].split("-");
	var parsedDate = new Date(dateParts[2], (dateParts[0] - 1), dateParts[1]);

	return parsedDate;
}

var formatTime = function(secs)
{
	var hr = Math.floor(secs / 3600);
	var min = Math.floor((secs - (hr * 3600))/60);
	var sec = secs - (hr * 3600) - (min * 60);

	var result = "";

	if (hr > 0)
		result += hr + ' hour' + (hr != 1 ? 's' : '') + ', ';
	
	if (min > 0)
		result += min + ' minute' + (min != 1 ? 's' : '') + ', ';

	result += sec + ' second' + (sec != 1 ? 's' : '') + '';

	return result;
}

// Credits: http://stackoverflow.com/a/544429
function dateDiff( str1, str2 ) {
    var diff = Date.parse( str2 ) - Date.parse( str1 ); 
    return isNaN( diff ) ? NaN : {
    	diff : diff,
    	ms : Math.floor( diff            % 1000 ),
    	s  : Math.floor( diff /     1000 %   60 ),
    	m  : Math.floor( diff /    60000 %   60 ),
    	h  : Math.floor( diff /  3600000 %   24 ),
    	d  : Math.floor( diff / 86400000        )
    };
}
