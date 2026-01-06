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
        <QUERY objecttype="OperativeEvent" namespace="ols.open" schemaversion="1" limit="10">
            <FILTER>
            <AND>
                <EQ name="EventState" value="1" />
                <IN name="EventTrafficType" value="0,2" />
                <EQ name="Deleted" value="false" />
                <ELEMENTMATCH>
                <EQ name="TrafficImpact.SelectedSection.SectionLocation.Signature" value="${locationSignature1}"/>
                <EQ name="TrafficImpact.SelectedSection.SectionLocation.Signature" value="${locationSignature2}"/>
                <EXISTS name="TrafficImpact.PublicMessage" value="True" />
                <GTE name="TrafficImpact.PublicMessage.EndDateTime" value="$now"/>
                </ELEMENTMATCH>
            </AND>
            </FILTER>
            <INCLUDE>TrafficImpact.PublicMessage</INCLUDE>
        </QUERY>
    `
    return query
}

async function getNextTrain(from, direction) {
    var response = await sendAPIRequest(getNextTrainQuery(from, direction))
    data = JSON.parse(response)

    if (data.RESPONSE && data.RESPONSE.RESULT && data.RESPONSE.RESULT[0]) {
        trains = data.RESPONSE.RESULT[0].TrainAnnouncement || []
    }

    trains.forEach(train => {
        //Deviations
        train.Deviations = [];
        train.ReplacedByBus = false;

        //Deviations and ReplacedByBus
        if ("Deviation" in train) {
            train.Deviation.forEach(deviation => {
                train.Deviations.push(deviation.Description);
            });

            if (train.Deviation.filter(deviation => deviation.Code == "ANA007").length > 0) {
                train.ReplacedByBus = true;
            }
        }


        //ExpectedDepartureTime
        // use estimated time if available and planned otherwise
        if ("EstimatedTimeAtLocation" in train & !train.Canceled) {
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
        } else if (train.Delay > 10) {
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
        return !train.Canceled || (train.ReplacedByBus && train.ExpectedDepartureTimeTime - new Date() > 0);
    });

    // sort by expected departure time
    trains.sort((a, b) => a.PlannedDepartureTime - b.PlannedDepartureTime)

    
    if (trains.length > 0) {
        let nextTrain = trains[0];
        try {
            let stationNames = await getStationNames([nextTrain.LocationSignature, nextTrain.ToLocation[0].LocationName]);
            nextTrain.DepartureStation = stationNames[nextTrain.LocationSignature];
            nextTrain.DestinationStation = stationNames[nextTrain.ToLocation[0].LocationName];
        } catch (error) {
            console.error("Error getting station names: " + error);
        }

        nextTrain.trafficInfo = [];

        if (canceledTrains.length >= 2) {
            canceledText = "Tåg " + canceledTrains.join(", ") + " inställda";
            nextTrain.trafficInfo.push(canceledText);
        } else if (canceledTrains.length == 1) {
            nextTrain.trafficInfo.push("Tåg " + canceledTrains[0] + " inställt");
        }

        try {
            nextTrain.trafficInfo = nextTrain.trafficInfo.concat(await getTrafficInfo(from, direction));
        } catch (error) {
            console.error("Error getting traffic info: " + error);
        }

        return nextTrain;
    } else {
        return null;
    }
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
                messages.push(impact.PublicMessage.Header);
            });
        });
    }

    //keep only unique messages
    messages = messages.filter((message, index, self) =>
        self.indexOf(message) === index
    );

    return messages;
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

let nextTrain = await getNextTrain(from, direction);
let widget = await createWidget(nextTrain)
// Check if the script is running in
// a widget. If not, show a preview of
// the widget to easier debug it.
if (!config.runsInWidget) {
  await widget.presentMedium()
}
// Tell the system to show the widget.
Script.setWidget(widget)
Script.complete()

async function createWidget(train) {
  var alertColor = new Color("e00000")

  if (train == null) {
    let w = new ListWidget()
    w.addText("Inga avgångar närmaste 3 timmar")
    w.refreshAfterDate = new Date(Date.now() + 90 * 60 * 1000); //90 minutes

    w.addSpacer(6)
    // Traffic info
    try {
      if (!config.runsInAccessoryWidget || config.widgetFamily == "accessoryRectangular") {
        let trafficInfoStr = (await getTrafficInfo(from, direction)).join(", ");

        if (trafficInfoStr.length > 0) {
          let trafficInfoStack = w.addStack()
          let infoSymbol = SFSymbol.named("info.circle")
          infoSymbol.applyFont(Font.regularSystemFont(14))
          let infoImg = trafficInfoStack.addImage(infoSymbol.image)
          infoImg.imageSize = new Size(12, 12)
          infoImg.tintColor = alertColor;
          trafficInfoStack.addSpacer(4)
          let trafficInfoTxt = trafficInfoStack.addText(trafficInfoStr)
          trafficInfoTxt.font = Font.regularSystemFont(12)
          trafficInfoTxt.textColor = alertColor;
          trafficInfoTxt.textOpacity = 1.0
          w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000); //15 minutes
        }
      }
    } catch (error) {
      console.error("Error getting traffic info: " + error);
    }


    return w
  }

  let w = new ListWidget()
  w.url = train.WebLink;

  //Set color according to status
  var textColor = Color.white();
  if (train.Status == "Major deviation") {
    w.backgroundColor = new Color("e00000")
    textColor = new Color("#eeeeee")
    alertColor = Color.white();
  } else if (train.Status == "Minor deviation") {
    w.backgroundColor = new Color("#00337A")
  } else {
    w.backgroundColor = new Color("#00204C")
  }

  // Add spacer above content to center it vertically.
  w.addSpacer()

  // Platform information
  if (!config.runsInAccessoryWidget) {
    let platformStr = "Spår " + train.TrackAtLocation + ", " + train.DepartureStation;
    let platformTxt = w.addText(platformStr)
    platformTxt.font = Font.mediumSystemFont(12)
    platformTxt.textColor = textColor;
    platformTxt.textOpacity = 0.9;
  }
  w.addSpacer(6)
  // Time information

  if (train.Delay == null) {
    let awaitTimeTxt = w.addText("Invänta tid")
    awaitTimeTxt.font = Font.boldSystemFont(16)
    awaitTimeTxt.textColor = alertColor;
  } else if (train.ExpectedDepartureTime - new Date() < 1 * 60 * 1000) {
    let departingTxt = w.addText("Avgår nu")
    departingTxt.font = Font.boldSystemFont(16)
    departingTxt.textColor = textColor;
  } else if (train.ExpectedDepartureTime - new Date() < 60 * 60 * 1000) {
    let timeStack = w.addStack()
    let countdown = timeStack.addDate(train.ExpectedDepartureTime)
    countdown.applyRelativeStyle();
    countdown.font = Font.boldSystemFont(16)
    countdown.textColor = textColor
  } else {
    let timeStack = w.addStack()
    let countdown = timeStack.addDate(train.ExpectedDepartureTime)
    countdown.applyTimeStyle();
    countdown.font = Font.boldSystemFont(16)
    countdown.textColor = textColor
  }

  if ((!config.runsInAccessoryWidget || (config.widgetFamily == "accessoryRectangular")) && train.Delay > 0) {
    let delayStack = w.addStack()
    let nytidTxt = delayStack.addText("Ny tid")
    nytidTxt.font = Font.mediumSystemFont(12)
    nytidTxt.textColor = textColor;
    nytidTxt.textOpacity = 0.9;
    delayStack.addSpacer(2)
    let delayTime = delayStack.addDate(train.ExpectedDepartureTime)
    delayTime.applyTimeStyle();
    delayTime.font = Font.mediumSystemFont(12)
    delayTime.textColor = alertColor;
    delayTime.textOpacity = 0.9;

    if (["medium", "large", "extraLarge"].includes(config.widgetFamily)) {
      delayStack.addSpacer(4)
      let delayText = delayStack.addText("(" + train.Delay + " min försenad)")
      delayText.font = Font.mediumSystemFont(12)
      delayText.textColor = textColor;
      delayText.textOpacity = 0.9;
    }
  }

  w.addSpacer(6)
  // Tåginfo
  if (!config.runsInAccessoryWidget || (config.widgetFamily == "accessoryRectangular" && train.Deviations.length == 0)) {

    if (config.runsInAccessoryWidget) {
      trainStr = "Tåg " + train.AdvertisedTrainIdent + " mot " + train.DestinationStation;
    } else {
      trainStr = train.Product + " " + train.AdvertisedTrainIdent + " mot " + train.DestinationStation;
    }
    
    let trainTxt = w.addText(trainStr)
    trainTxt.font = Font.mediumSystemFont(12)
    trainTxt.textColor = textColor;
    trainTxt.textOpacity = 0.9
  }

  w.addSpacer(4)
  // Deviations
  if ((!config.runsInAccessoryWidget || (config.widgetFamily == "accessoryRectangular")) && train.Deviations.length > 0) {
    let deviationStack = w.addStack()
    let warningSymbol = SFSymbol.named("exclamationmark.triangle")
    warningSymbol.applyFont(Font.mediumSystemFont(14))
    let warningImg = deviationStack.addImage(warningSymbol.image)
    warningImg.imageSize = new Size(12, 12)
    warningImg.tintColor = alertColor
    deviationStack.addSpacer(4)
    let deviationsTxt = deviationStack.addText(train.Deviations.join(", "))
    deviationsTxt.font = Font.mediumSystemFont(12)
    deviationsTxt.textColor = alertColor;
    deviationsTxt.textOpacity = 0.9
  }

  // Traffic info
  if (!config.runsInAccessoryWidget || (config.widgetFamily == "accessoryRectangular" && train.Deviations.length == 0)) {
    let trafficInfoStack = w.addStack()
    let infoSymbol = SFSymbol.named("info.circle")
    infoSymbol.applyFont(Font.regularSystemFont(14))
    let infoImg = trafficInfoStack.addImage(infoSymbol.image)
    infoImg.imageSize = new Size(12, 12)
    infoImg.tintColor = textColor;
    trafficInfoStack.addSpacer(4)
    let trafficInfoTxt = trafficInfoStack.addText(train.trafficInfo.join(", "))
    trafficInfoTxt.font = Font.regularSystemFont(12)
    trafficInfoTxt.textColor = textColor;
    trafficInfoTxt.textOpacity = 1.0
  }
  
  // Add spacing below content to center it vertically.
  w.addSpacer()

  // Set refresh rate
  var refreshInMinutes = 10; //default to 10 minutes
  if (train.ExpectedDepartureTime - new Date() < 10 * 60 * 1000) {
    //less than 10 minutes to next departure
    refreshInMinutes = 0.5;
  } else if (train.Status != "On time") {
    //not on time
    refreshInMinutes = 1;
  } else if (train.ExpectedDepartureTime - new Date() < 30 * 60 * 1000) {
    //less than 30 minutes to next departure
    refreshInMinutes = 3;
  } else if (train.ExpectedDepartureTime - new Date() < 60 * 60 * 1000) {
    //less than 1 hour to next departure
    refreshInMinutes = 6;
  }

  w.refreshAfterDate = new Date(Date.now() + refreshInMinutes * 60 * 1000);
  console.log("Refresh in " + refreshInMinutes + " minutes");
  return w
}