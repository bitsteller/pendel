var apiKey = 'c195e88db6424433beaca217c7a0aa24'
var url = 'https://api.trafikinfo.trafikverket.se/v2/data.json'

async function sendAPIRequest(query) {
    var request = new Request(url)
    request.headers.set('Content-Type', 'application/xml')

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

async function getNextTrain(from, direction) {
    var response = await sendAPIRequest(getNextTrainQuery(from, direction))
    data = JSON.parse(response)

    if (data.RESPONSE && data.RESPONSE.RESULT && data.RESPONSE.RESULT[0]) {
        trains = data.RESPONSE.RESULT[0].TrainAnnouncement || []
    }


    trains.forEach(element => {
        //ExpectedDepartureTime
        // use estimated time if available and planned otherwise
        if ("EstimatedTimeAtLocation" in element & !element.Canceled) {
            element.ExpectedDepartureTime = new Date(element.EstimatedTimeAtLocation)
        } else {
            element.ExpectedDepartureTime = new Date(element.AdvertisedTimeAtLocation)
        }

        //PlannedDepartureTime
        element.PlannedDepartureTime = new Date(element.AdvertisedTimeAtLocation)

        //Product
        if (element.ProductInformation.length > 0) {
            element.Product = element.ProductInformation[0].Description;
        } else {
            element.Product = "Tåg";
        }

        //Deviations
        element.Deviations = [];

        if ("Deviation" in element) {
            element.Deviation.forEach(deviation => {
                element.Deviations.push(deviation.Description);
            });
        }

        if (element.Canceled) {
            element.Deviations.push("Inställd");
        }
    });

    // sort by expected departure time
    trains.sort((a, b) => a.PlannedDepartureTime - b.PlannedDepartureTime)


    if (trains.length > 0) {
        return trains[0];
    } else {
        return null;
    }
}

function getNextTrainQuery(from, direction) {
    var query = `
        <QUERY objecttype="TrainAnnouncement" schemaversion="1.9">
        <FILTER>
            <AND>
            <NOT>
                <EXISTS name="TimeAtLocation" value="true" />
            </NOT>
            <GT name="AdvertisedTimeAtLocation" value="$dateadd(-1:00:00)" />
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
        <INCLUDE>ToLocation</INCLUDE>
        <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
        <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
        <INCLUDE>EstimatedTimeIsPreliminary</INCLUDE>
        <INCLUDE>AdvertisedTrainIdent</INCLUDE>
        <INCLUDE>ProductInformation</INCLUDE>
        <INCLUDE>Canceled</INCLUDE>
        <INCLUDE>Deviation</INCLUDE>
        </QUERY>
    `
    return query
}