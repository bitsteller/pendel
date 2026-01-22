var apiKey = 'c195e88db6424433beaca217c7a0aa24'
var url = 'https://api.trafikinfo.trafikverket.se/v2/data.json'

async function sendAPIRequest(query) {
    var request = new Request(url)
    request.headers = {"Content-Type": 'application/xml'}

    var requestBody = `
    <REQUEST>
      <LOGIN authenticationkey='c195e88db6424433beaca217c7a0aa24' />
      ${query}
    </REQUEST>
    `
    request.method = 'POST'
    request.body = requestBody

    return await request.loadString()
}

function shortenString(str, limit) {
    if (str.length <= limit) {
        return str;
    }
    
    // Reserve space for "..."
    var truncateLimit = limit - 3;
    
    // Try to find the last non-alphabetic character (word separator) before the limit
    var lastSeparator = -1;
    for (var i = truncateLimit - 1; i >= 0; i--) {
        var char = str.charAt(i);
        if (!/[a-zA-Z]/.test(char)) {
            lastSeparator = i;
            break;
        }
    }
    
    // If we found a separator and it's not too far from the limit (within reasonable distance)
    if (lastSeparator > 0 && lastSeparator > truncateLimit * 0.5) {
        return str.substring(0, lastSeparator) + "...";
    }
    
    // Check if the last word is very long (more than 50% of limit or > 10 chars)
    var nextSeparator = -1;
    for (var i = truncateLimit; i < str.length; i++) {
        var char = str.charAt(i);
        if (!/[a-zA-Z]/.test(char)) {
            nextSeparator = i;
            break;
        }
    }
    var lastWordLength = nextSeparator > 0 ? nextSeparator - truncateLimit : str.length - truncateLimit;
    
    // If the last word is very long, truncate in the middle
    if (lastWordLength > Math.max(limit * 0.5, 10)) {
        return str.substring(0, truncateLimit) + "...";
    }
    
    // Otherwise, truncate at word boundary (use the separator we found, or truncate if no separator)
    if (lastSeparator > 0) {
        return str.substring(0, lastSeparator) + "...";
    }
    
    // Fallback: truncate in the middle if no separator found
    return str.substring(0, truncateLimit) + "...";
}

function getNextTrainQuery(from, direction) {
    var query = `
        <QUERY objecttype="TrainAnnouncement" schemaversion="1.9">
            <FILTER>
                <AND>
                <NOT>
                    <EXISTS name="TimeAtLocation" value="true" />
                </NOT>
                <OR>
                  <GT name="AdvertisedTimeAtLocation" value="$dateadd(-1:00:00)" />
                  <ELEMENTMATCH>
                    <EQ name="Deviation.Code" value="ANA007" /> <!--buss ersätter-->
                  </ELEMENTMATCH>
                </OR>
                <OR>
                    <LT name="AdvertisedTimeAtLocation" value="$dateadd(3:00:00)" />
                    <LT name="EstimatedTimeAtLocation" value="$dateadd(3:00:00)" />
                    <ELEMENTMATCH>
                    <EQ name="Deviation.Code" value="ANA088" /> <!--invänta tid-->
                    </ELEMENTMATCH>
                </OR>
                <EQ name="LocationSignature" value="${from}" />
                <EQ name="ActivityType" value="Avgang" />
                <OR>
                    <ELEMENTMATCH>
                    <EQ name="ToLocation.LocationName" value="${direction}" />
                    </ELEMENTMATCH>
                    <ELEMENTMATCH>
                    <EQ name="ViaToLocation.LocationName" value="${direction}" />
                    </ELEMENTMATCH>
                </OR>
                </AND>
            </FILTER>
            <INCLUDE>LocationSignature</INCLUDE>
            <INCLUDE>ToLocation</INCLUDE>
            <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
            <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
            <INCLUDE>EstimatedTimeIsPreliminary</INCLUDE>
            <INCLUDE>AdvertisedTrainIdent</INCLUDE>
            <INCLUDE>ProductInformation</INCLUDE>
            <INCLUDE>Canceled</INCLUDE>
            <INCLUDE>Deviation</INCLUDE>
            <INCLUDE>TrackAtLocation</INCLUDE>
            <INCLUDE>WebLink</INCLUDE>
        </QUERY>
    `
    return query
}


function getStationNamesQuery(locationSignatures) {
    locationSignatures = locationSignatures.join(", ");
    var query = `
        <QUERY objecttype="TrainStation" namespace="rail.infrastructure" schemaversion="1.5">
            <FILTER>
                <IN name="LocationSignature" value="${locationSignatures}" />
            </FILTER>
            <INCLUDE>LocationSignature</INCLUDE>
            <INCLUDE>AdvertisedLocationName</INCLUDE>
        </QUERY>
    `
    return query
}


function getTrafficInfoQuery(locationSignature1, locationSignature2) {
    var query = `
        <QUERY objecttype="OperativeEvent" namespace="ols.open" schemaversion="1" orderby="StartDateTime desc, TrafficImpact.PublicMessage.StartDateTime desc" limit="5">
            <FILTER>
            <AND>
                <EQ name="EventState" value="1" />
                <IN name="EventTrafficType" value="0,2" />
                <EQ name="Deleted" value="false" />
                <EXISTS name="TrafficImpact.PublicMessage" value="True" />
                <GTE name="TrafficImpact.PublicMessage.EndDateTime" value="$now"/>
                <AND>
                  <EQ name="TrafficImpact.SelectedSection.SectionLocation.Signature" value="${locationSignature1}"/>
                  <EQ name="TrafficImpact.SelectedSection.SectionLocation.Signature" value="${locationSignature2}"/>
                </AND>
            </AND>
            </FILTER>
            <INCLUDE>TrafficImpact.PublicMessage</INCLUDE>
            <INCLUDE>StartDateTime</INCLUDE>
        </QUERY>
    `
    return query
}


async function getStationNames(locationSignatures) {
    var response = await sendAPIRequest(getStationNamesQuery(locationSignatures))
    data = JSON.parse(response)

    var stations = {}
    

    if (data.RESPONSE && data.RESPONSE.RESULT && data.RESPONSE.RESULT[0]) {
        data.RESPONSE.RESULT[0].TrainStation.forEach(station => {
            stations[station.LocationSignature] = station.AdvertisedLocationName;
        });
    }

    return stations;
}

async function getTrafficInfo(locationSignature1, locationSignature2) {
    var response = await sendAPIRequest(getTrafficInfoQuery(locationSignature1, locationSignature2))
    data = JSON.parse(response)

    messages = [];

    if (data.RESPONSE && data.RESPONSE.RESULT && data.RESPONSE.RESULT[0]) {
        data.RESPONSE.RESULT[0].OperativeEvent.forEach(event => {
            event.TrafficImpact.forEach(impact => {
                if (impact.PublicMessage.Header) {
                    messages.push(shortenString(impact.PublicMessage.Header, 25));
                }
            });
        });
    }

    //trim all messages
    messages = messages.map(message => message.trim());

    //keep only unique messages
    messages = messages.filter((message, index, self) =>
        self.indexOf(message) === index
    );

    return messages;
}

async function getData(from, direction) {
    var response = await sendAPIRequest(getNextTrainQuery(from, direction))
    data = JSON.parse(response)

    var trains = [];
    var canceledTrains = [];
    if (data.RESPONSE && data.RESPONSE.RESULT && data.RESPONSE.RESULT[0]) {
        trains = data.RESPONSE.RESULT[0].TrainAnnouncement || [];
        trains.forEach(train => {
            //Deviations
            train.Deviations = [];
            train.ReplacedByBus = false;
            train.TrackChanged = false;
    
            //Deviations and ReplacedByBus
            if ("Deviation" in train) {
                train.Deviation.forEach(deviation => {
                    if (deviation.Code == "ANA007") {
                        train.ReplacedByBus = true;
                        train.Deviations.push("Ersättningsbuss");
                    } else {
                        train.Deviations.push(deviation.Description);
                    }

                    if (deviation.Code == "ANA055") {
                        train.TrackChanged = true;
                    }
                });
            }
    
    
            //ExpectedDepartureTime
            // use estimated time if available and planned otherwise
            if ("EstimatedTimeAtLocation" in train) {
                train.ExpectedDepartureTime = new Date(train.EstimatedTimeAtLocation)
            } else {
                train.ExpectedDepartureTime = new Date(train.AdvertisedTimeAtLocation)
            }
    
            //PlannedDepartureTime
            train.PlannedDepartureTime = new Date(train.AdvertisedTimeAtLocation)
    
            //Product
            if (train.ProductInformation.length > 0) {
                train.Product = train.ProductInformation[0].Description;
            } else {
                train.Product = "Tåg";
            }
    
            //Delay
            if ("EstimatedTimeAtLocation" in train && (!train.Canceled || train.ReplacedByBus)) {
                train.Delay = (new Date(train.EstimatedTimeAtLocation) - new Date(train.AdvertisedTimeAtLocation)) / (1000*60);
            } else if (train.Canceled || train.Deviations.includes("Invänta tid")) {
                train.Delay = null;
            } else {
                train.Delay = 0;
            }
    
            //Status
            if (train.Canceled || (train.Deviations.includes("Invänta tid"))) {
                train.Status = "Major deviation";
            } else if (train.Delay > 15) {
                train.Status = "Major deviation";
            } else if (train.Delay > 0 || train.Deviations.length > 0) {
                train.Status = "Minor deviation";
            } else {
                train.Status = "On time";
            }
        });
    
        // List cancelled trains only until planned departure
        canceledTrains = [];
        trains.forEach(train => {
            if (train.Canceled && (train.PlannedDepartureTime - new Date() > 0)) {
                canceledTrains.push(train.AdvertisedTrainIdent);
            }
        });
    
        // Keep only trains that are not cancelled or replaced by bus
        trains = trains.filter(train => {
            return !train.Canceled || (train.ReplacedByBus && (train.ExpectedDepartureTime - new Date() > 0));
        });
    
        // sort by expected departure time
        trains.sort((a, b) => a.ExpectedDepartureTime - b.ExpectedDepartureTime)
    }

    
    var trafficInfo = [];
    var nextTrain = null;
    if (trains.length > 0) {
        nextTrain = trains[0];
        try {
            let stationNames = await getStationNames([nextTrain.LocationSignature, nextTrain.ToLocation[0].LocationName]);
            nextTrain.DepartureStation = stationNames[nextTrain.LocationSignature];
            nextTrain.DestinationStation = stationNames[nextTrain.ToLocation[0].LocationName];
        } catch (error) {
            console.error("Error getting station names: " + error);
        }

        trafficInfo = [];

        if (canceledTrains.length >= 2) {
            canceledText = "Tåg " + canceledTrains.join(", ") + " inställda";
            trafficInfo.push(canceledText);
        } else if (canceledTrains.length == 1) {
            trafficInfo.push("Tåg " + canceledTrains[0] + " inställt");
        }
    }

    try {
        trafficInfo = trafficInfo.concat(await getTrafficInfo(from, direction));
    } catch (error) {
        console.error("Error getting traffic info: " + error);
    }

    return {
        nextTrain: nextTrain,
        trafficInfo: trafficInfo
    };
}