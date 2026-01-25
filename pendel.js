// This script shows the next train from the selected location in a widget on your Home screen.
var from = "Nr";
var direction = "Nk";

/*
trv.js
*/
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

    var status = "No departures";
    if (nextTrain != null) {
        status = nextTrain.Status;
    }

    return {
        nextTrain: nextTrain,
        trafficInfo: trafficInfo,
        status: status
    };
}

/*
 Widget code
*/


//Parse parameters from widget
var from = "Nk";
var direction = "Nr";
try {
  let params = args.widgetParameter.split(",");
  from = params[0].trim();
  direction = params[1].trim();
} catch (error) {
  console.error("Error parsing parameters: " + error);
}

if (args.widgetParameter == null || args.widgetParameter == "") {
  //DEBUG: from Nr to Nk if clock is between 0:00 and 12:00 and from Nk to Nr if clock is between 12:00 and 24:00
  if (new Date().getHours() >= 0 && new Date().getHours() < 12) {
    from = "Nr";
    direction = "Nk";
  } else {
    from = "Nk";
    direction = "Nr";
  }
}

var widget = null;
try {
  let data = await getData(from, direction);
  if (data.status == "No departures") {
    widget = createNoDeparturesWidget(data);
  } else {
    widget = await createWidget(data);
  }
  // Check if the script is running in
  // a widget. If not, show a preview of
  // the widget to easier debug it.
  if (!config.runsInWidget) {
    await widget.presentMedium()
  }
  // Tell the system to show the widget.
} catch (error) {
  console.error("Error getting next train: " + error);
  widget = createErrorWidget(error)
}

Script.setWidget(widget)
Script.complete()


function getColor(name, theme = "") {
  if (theme == "Major deviation") {
    if (name == "bg") {
      return new Color("e00000")
    } else if (name == "fg") {
      return new Color("#c0c0c0");
    } else if (name == "alert") {
      return Color.white();
    }
  } else if (theme == "Minor deviation") {
    if (name == "bg") {
      return new Color("#004cb5");
    } else if (name == "fg") {
      return Color.white();
    } else if (name == "alert") {
      return new Color("e00000");
    }
  } else if (theme == "No departures") {
    if (name == "bg") {
      return new Color("#505050");
    } else if (name == "fg") {
      return Color.white();
    } else if (name == "alert") {
      return new Color("e00000");
    }
  } else {
    if (name == "bg") {
      return new Color("#00204C");
    } else if (name == "fg") {
      return Color.white();
    } else if (name == "alert") {
      return new Color("e00000");
    }
  }
}


function createErrorWidget(error) {
  let w = new ListWidget()
  let errorTxt = w.addText("Error getting next train: " + error)
  errorTxt.font = Font.mediumSystemFont(12)
  errorTxt.textColor = getColor("alert");
  errorTxt.textOpacity = 1.0
  w.refreshAfterDate = new Date(Date.now() + 10 * 60 * 1000); //10 minutes
  return w
}

function createNoDeparturesWidget(data) {
  let w = new ListWidget()
  w.backgroundColor = getColor("bg", "No departures");
  w.addText("Inga avgångar närmaste 3 timmar");
  w.refreshAfterDate = new Date(Date.now() + 90 * 60 * 1000); //90 minutes

  w.addSpacer(6)
  // Traffic info
  try {
    if (!config.runsInAccessoryWidget || config.widgetFamily == "accessoryRectangular") {
      let trafficInfoStr = data.trafficInfo.join(", ");

      if (trafficInfoStr.length > 0) {
        let trafficInfoStack = w.addStack()
        let infoSymbol = SFSymbol.named("info.circle")
        infoSymbol.applyFont(Font.regularSystemFont(14))
        let infoImg = trafficInfoStack.addImage(infoSymbol.image)
        infoImg.imageSize = new Size(12, 12)
        infoImg.tintColor = getColor("fg", "No departures");
        trafficInfoStack.addSpacer(4)
        let trafficInfoTxt = trafficInfoStack.addText(trafficInfoStr)
        trafficInfoTxt.font = Font.regularSystemFont(12)
        trafficInfoTxt.textColor = getColor("fg", "No departures");
        trafficInfoTxt.textOpacity = 1.0
        w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000); //15 minutes
      }
    }
  } catch (error) {
    console.error("Error getting traffic info: " + error);
  }

  return w
}

async function createWidget(data) {
  let w = new ListWidget()
  w.url = data.nextTrain.WebLink;
  w.backgroundColor = getColor("bg", data.status);


  //Station name
  if (!config.runsInAccessoryWidget && !(config.widgetFamily == "small" && data.nextTrain.Deviations.length > 0)) {
    let stationStack = w.addStack()
    stationStack.addSpacer();
    var maxLength = config.widgetFamily == "accessoryRectangular" ? 15 : 30;
    let stationTxt = stationStack.addText(shortenString(data.nextTrain.DepartureStation, maxLength))
    stationTxt.font = Font.regularRoundedSystemFont(12);
    stationTxt.textColor = getColor("fg", data.status);
    stationTxt.textOpacity = 0.5;
  }

  // Add spacer above content to center it vertically.
  w.addSpacer()

  // Tåginfo
  let trainStack = w.addStack()
  if (config.runsInAccessoryWidget) {

    let trainSymbol = SFSymbol.named("tram.fill")
    trainSymbol.applyFont(Font.mediumSystemFont(12))
    let trainImg = trainStack.addImage(trainSymbol.image)
    trainImg.imageSize = new Size(12, 12)
    trainImg.tintColor = getColor("fg", data.status);
  
    trainStack.addSpacer(2);
    trainStr = data.nextTrain.AdvertisedTrainIdent + " mot " + shortenString(data.nextTrain.DestinationStation, 14);
  } else {
    trainStr = data.nextTrain.Product + " " + data.nextTrain.AdvertisedTrainIdent + " mot " + data.nextTrain.DestinationStation;
  }
  
  let trainTxt = trainStack.addText(trainStr)
  trainTxt.font = Font.mediumSystemFont(12)
  trainTxt.textColor = getColor("fg", data.status);
  trainTxt.textOpacity = 0.9;
  
  w.addSpacer(6)
  // Time information

  if (data.nextTrain.Delay == null) {
    let awaitTimeTxt = w.addText("Invänta tid")
    awaitTimeTxt.font = Font.boldSystemFont(16)
    awaitTimeTxt.textColor = getColor("alert", data.status);
  } else if (data.nextTrain.ExpectedDepartureTime - new Date() < 1 * 60 * 1000) {
    let departingTxt = w.addText("Avgår nu")
    departingTxt.font = Font.boldSystemFont(16)
    departingTxt.textColor = getColor("fg", data.status);
  } else if (data.nextTrain.ExpectedDepartureTime - new Date() < 60 * 60 * 1000) {
    let timeStack = w.addStack()
    let countdown = timeStack.addDate(data.nextTrain.ExpectedDepartureTime)
    countdown.applyRelativeStyle();
    countdown.font = Font.boldSystemFont(16)
    countdown.textColor = getColor("fg", data.status);
  } else {
    let timeStack = w.addStack()
    let countdown = timeStack.addDate(data.nextTrain.ExpectedDepartureTime)
    countdown.applyTimeStyle();
    countdown.font = Font.boldSystemFont(16)
    countdown.textColor = getColor("fg", data.status);
  }

  w.addSpacer(4);
  
  // Departure details
  if (!config.runsInAccessoryWidget) {
    let departureStack = w.addStack()
    let platformPrefixTxt = departureStack.addText("Spår ")
    platformPrefixTxt.font = Font.mediumSystemFont(12)
    platformPrefixTxt.textColor = getColor("fg", data.status);
    platformPrefixTxt.textOpacity = 0.9;
    
    let trackColor = data.nextTrain.trackChanged ? getColor("alert", data.status) : getColor("fg", data.status);
    let platformTrackTxt = departureStack.addText(data.nextTrain.TrackAtLocation)
    platformTrackTxt.font = Font.mediumSystemFont(12)
    platformTrackTxt.textColor = trackColor;
    platformTrackTxt.textOpacity = 0.9;

    if (data.nextTrain.Delay > 0) {
      let delayStack = w.addStack()
      let nytidTxt = delayStack.addText(", ny tid")
      nytidTxt.font = Font.mediumSystemFont(12)
      nytidTxt.textColor = getColor("fg", data.status);
      nytidTxt.textOpacity = 0.9;
      delayStack.addSpacer(2)
      let delayTime = delayStack.addDate(data.nextTrain.ExpectedDepartureTime)
      delayTime.applyTimeStyle();
      delayTime.font = Font.boldSystemFont(12)
      delayTime.textColor = getColor("alert", data.status);
      delayTime.textOpacity = 0.9;

      if (["medium", "large", "extraLarge"].includes(config.widgetFamily)) {
        delayStack.addSpacer(2)
        let delayText = delayStack.addText("(" + data.nextTrain.Delay + " min försenad)")
        delayText.font = Font.mediumSystemFont(12)
        delayText.textColor = getColor("fg", data.status);
        delayText.textOpacity = 0.9;
      }
    }

  } else {
    if (config.widgetFamily == "accessoryRectangular" && data.nextTrain.Delay > 0) {
      let delayStack = w.addStack()
      let nytidTxt = delayStack.addText("Ny tid")
      nytidTxt.font = Font.mediumSystemFont(12)
      nytidTxt.textColor = getColor("fg", data.status);
      nytidTxt.textOpacity = 0.9;
      delayStack.addSpacer(2)
      let delayTime = delayStack.addDate(data.nextTrain.ExpectedDepartureTime)
      delayTime.applyTimeStyle();
      delayTime.font = Font.boldSystemFont(12)
      delayTime.textColor = getColor("alert", data.status);
      delayTime.textOpacity = 0.9;
    }
  }

  w.addSpacer(6)
  // Deviations
  if ((!config.runsInAccessoryWidget || (config.widgetFamily == "accessoryRectangular")) && data.nextTrain.Deviations.length > 0) {
    let deviationStack = w.addStack()
    let warningSymbol = SFSymbol.named("exclamationmark.triangle")
    warningSymbol.applyFont(Font.mediumSystemFont(14))
    let warningImg = deviationStack.addImage(warningSymbol.image)
    warningImg.imageSize = new Size(12, 12)
    warningImg.tintColor = getColor("alert", data.status);
    deviationStack.addSpacer(4)
    let deviationsTxt = deviationStack.addText(data.nextTrain.Deviations.join(", "))
    deviationsTxt.font = Font.mediumSystemFont(12)
    deviationsTxt.textColor = getColor("alert", data.status);
    deviationsTxt.textOpacity = 0.9
  }

  // Traffic info
  if ((!config.runsInAccessoryWidget || (config.widgetFamily == "accessoryRectangular" && data.nextTrain.Deviations.length == 0)) && data.trafficInfo.length > 0) {
    let trafficInfoStack = w.addStack()
    let infoSymbol = SFSymbol.named("info.circle")
    infoSymbol.applyFont(Font.regularSystemFont(14))
    let infoImg = trafficInfoStack.addImage(infoSymbol.image)
    infoImg.imageSize = new Size(12, 12)
    infoImg.tintColor = getColor("fg", data.status);
    trafficInfoStack.addSpacer(4)
    let trafficInfoTxt = trafficInfoStack.addText(data.trafficInfo.join(", "))
    trafficInfoTxt.font = Font.regularSystemFont(12)
    trafficInfoTxt.textColor = getColor("fg", data.status);
    trafficInfoTxt.textOpacity = 1.0
  }
  
  // Add spacing below content to center it vertically.
  w.addSpacer()

  // Set refresh rate
  var refreshInMinutes = 10; //default to 10 minutes
  if (data.nextTrain.ExpectedDepartureTime - new Date() < 10 * 60 * 1000) {
    //less than 10 minutes to next departure
    refreshInMinutes = 0.5;
  } else if (data.nextTrain.Status != "On time") {
    //not on time
    refreshInMinutes = 1;
  } else if (data.nextTrain.ExpectedDepartureTime - new Date() < 30 * 60 * 1000) {
    //less than 30 minutes to next departure
    refreshInMinutes = 3;
  } else if (data.nextTrain.ExpectedDepartureTime - new Date() < 60 * 60 * 1000) {
    //less than 1 hour to next departure
    refreshInMinutes = 6;
  }

  w.refreshAfterDate = new Date(Date.now() + refreshInMinutes * 60 * 1000);
  console.log("Refresh in " + refreshInMinutes + " minutes");
  return w
}