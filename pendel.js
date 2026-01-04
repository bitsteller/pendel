// The script shows the latest article
// from MacStories in a widget on your
// Home screen. Go to your Home screen
// to set up the script in a widget.
// The script will present a preview
// of the widget when running in the
// app.
let items = await loadItems()
let widget = await createWidget(items)
// Check if the script is running in
// a widget. If not, show a preview of
// the widget to easier debug it.
if (!config.runsInWidget) {
  await widget.presentMedium()
}
// Tell the system to show the widget.
Script.setWidget(widget)
Script.complete()

async function createWidget(items) {
  let item = items[0]
  let authors = item.authors.map(a => {
    return a.name
  }).join(", ")
  let rawDate = item["date_published"]
  let date = new Date(Date.parse(rawDate))
  let dateFormatter = new DateFormatter()
  dateFormatter.useFullDateStyle()
  dateFormatter.useShortTimeStyle()
//   let strDate = dateFormatter.string(date)
  let gradient = new LinearGradient()
  gradient.locations = [0, 1]
  gradient.colors = [
    new Color("#b00a0fe6"),
    new Color("#b00a0fb3")
  ]
  let w = new ListWidget()

  w.backgroundColor = new Color("#b00a0f")
  w.backgroundGradient = gradient
  // Add spacer above content to center it vertically.
  w.addSpacer()
  // Show article headline.
  let titleTxt = w.addText(item.title)
  titleTxt.font = Font.boldSystemFont(16)
  titleTxt.textColor = Color.white()
  // Add spacing below headline.
  w.addSpacer(8)
  // Show authors.
  let dateformat = new DateFormatter()
  dateformat.useShortTimeStyle()
  let strDate = dateformat.string(new Date())
  let authorsTxt = w.addText(strDate)
  authorsTxt.font = Font.mediumSystemFont(12)
  authorsTxt.textColor = Color.white()
  authorsTxt.textOpacity = 0.9
  // Add spacing below authors.
  w.addSpacer(2)
  // Show date.
  strD = await getLocation()
  strDate = strD[0].subAdministrativeArea
  let dateTxt = w.addText(strDate)
  dateTxt.font = Font.mediumSystemFont(12)
  dateTxt.textColor = Color.white()
  dateTxt.textOpacity = 0.9
  // Add spacing below content to center it vertically.
  w.addSpacer()
  return w
}
  
async function loadItems() {
  let url = "https://macstories.net/feed/json"
  let req = new Request(url)
  let json = await req.loadJSON()
  return json.items
}

async function getLocation() {
  Location.setAccuracyToThreeKilometers()
  l = await Location.current()
  return Location.reverseGeocode(l.latitude, l.longitude)
}