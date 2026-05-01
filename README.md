# Pendel – train departure widget

A Scriptable widget for iOS that shows the next train departure from a chosen station, using live data from Trafikverket (Swedish Transport Administration).

## What the widget does

- **Next train:** Shows the next departing train on your route (train number, destination, time, track, delays).
- **Traffic info:** When no route is active, shows traffic information for the route that will be active next.
- **Scheduled routes:** You can define multiple routes with different time windows (e.g. weekday commute vs weekend), so the widget automatically switches route by day and time.

Data and station names are fetched from the Trafikverket API.

---

## Installation

1. **Install Scriptable**  
   Download [Scriptable](https://scriptable.app/) from the App Store (iOS).

2. **Add the widget script**  
   - Copy the contents of `pendel.js`.  
   - In Scriptable, create a new script and paste the code.  
   - Name the script (e.g. “Pendel”) and save.

3. **Add the widget to your Home Screen**  
   - Long-press the Home Screen → tap the **+** button to add a widget.  
   - Choose **Scriptable** and the size you want (e.g. medium).  
   - Tap the widget and select the script you created.  
   - Set the **Parameter** (see Configuration below).

---

## Configuration (widget parameter)

The widget is configured via the **Parameter** field in Scriptable (when you tap the widget and choose your script). You can use either specify a single fixed route or schedule multiple routes.

### Single route

In this mode the widget will show the next train on a single fixed route.

```
from,direction
```

or, to show only traffic information (no next train):

```
from,direction,1
```

**Examples:**

- `Nr,Lp` – Trains from Norrköping (Nr) toward Linköping (Lp).
- `Lp,Nr` – Trains from Linköping (Lp) toward Norrköping (Nr).
- `Nr,Lp,1` – Only traffic info for the Nr–Lp route.

### Schedule format (multiple routes by time)

When the parameter contains **`;`**, it is treated as a list of routes. Each route is active in a given time window:

`daySpec,timeSpec,from,direction`

Routes are separated by **`;`**. The **first** matching route for the current date and time is used.

**Day abbreviations (Swedish):**  
`Mån` Mon · `Tis` Tue · `Ons` Wed · `Tor` Thu · `Fre` Fri · `Lör` Sat · `Sön` Sun  

You can use a single day or a range:

- `Lör` – Saturday only.
- `Mån-Fre` – Monday to Friday.

**Time:** 24-hour, local time. Use `7` for 07:00 and `6:30` for 06:30. The window is **start inclusive, end exclusive** (e.g. `7-9` means 07:00–08:59).

**Example:**

```
Mån-Fre,7-9,Nr,Lp;Lör,6:30-9,Lp,Nr
```

- **Route 1:** Monday–Friday, 07:00–09:00 → show trains **Nr → Lp**.
- **Route 2:** Saturday, 06:30–09:00 → show trains **Lp → Nr**.

So on a Tuesday at 08:00 you see Nr→Lp; on Saturday at 07:00 you see Lp→Nr. Outside those windows, no route is “active” and the widget shows traffic info for the **next** route that will become active.

---

## How to get location signatures

Location signatures are short codes used by Trafikverket for stations. The widget uses them as `from` (departure station) and `direction` (destination).

**List of location signuatures**  
   All available locations signatures can be found here: [https://sv.wikipedia.org/wiki/Lista_över_trafikplatssignaturer_i_det_svenska_järnvägsnätet](https://sv.wikipedia.org/wiki/Lista_över_trafikplatssignaturer_i_det_svenska_järnvägsnätet)

Use the **exact** signature (e.g. `Nr`, `Lp`) in the widget parameter.