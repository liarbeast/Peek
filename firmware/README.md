# Peek frame firmware

`peek-frame.yaml` turns a Seeed XIAO ePaper EE04 board with the 7.3" Spectra 6 panel into a Peek frame. It is an
[ESPHome](https://esphome.io) configuration, so there is no code to write: ESPHome builds the firmware from it.

**Most people don't need this folder:** the install page at https://liarbeast.github.io/Peek/ (also linked from
Peek's Settings) puts the firmware on a frame straight from Chrome or Edge.

On every wake the frame joins Wi-Fi, downloads `/frame.png` from Peek, draws it (about 30 seconds), asks
`/api/sleep` how long to wait and goes into deep sleep until then. If Peek can't be reached it looks for Peek on the
network once more, then tries again after 15 minutes and keeps showing the last picture.

## Setting up

The firmware is the same for everyone; nothing personal is built in.

- **Wi-Fi:** typed on the install page right after installing (Improv). Or join the frame's own Wi-Fi network
  **Peek frame** from a phone and pick your home Wi-Fi there. Until Wi-Fi is set, the screen explains both.
- **Peek's address:** the frame asks the network for Peek (mDNS, `_peek._tcp`), which Peek announces when it runs
  with host networking (see `compose.yaml`). If nothing answers, the screen shows the frame's own page
  (`http://<frame's IP>/`), where you type Peek's address once. It's saved on the frame.

## Before you start

- Put the EE04's jumper on the side of the connector your screen's ribbon uses (24-pin or 50-pin), then plug in
  the ribbon and the battery. Seeed warns that the wrong jumper can damage the screen.
- Plug the screen's orange ribbon straight into the board's big connector. With the white extension cable and
  the small joiner in between, the screen stayed blank.
- Click the antenna onto the board, or it won't find any Wi-Fi.

## Build and flash it yourself

Install ESPHome (`brew install esphome` on a Mac, or `pip install esphome` elsewhere), connect the board with a
USB-C data cable and run, from the Peek folder:

```sh
esphome run firmware/peek-frame.yaml
```

Pick the board's USB port when ESPHome asks. The first build takes 5 to 10 minutes. If the board isn't found, hold
**B** (boot) on the XIAO, tap **R** (reset), let go of **B** and run the command again. Afterwards ESPHome shows the
frame's log, and the screen asks for Wi-Fi as above.

## Updating it later

A sleeping frame can't be reached over Wi-Fi. Press **KEY0**: the frame wakes, shows the current picture and stays
awake for 5 minutes. Run `esphome run firmware/peek-frame.yaml` in that time and choose the Wi-Fi option, or use the
install page over USB.

## Releases

The "Firmware and install page" workflow builds the firmware for every GitHub release, attaches it to the release
and publishes the install page (`install/`) with it on GitHub Pages.

## Testing

To make the frame wake every 2 minutes instead of at each refresh, add `PEEK_SLEEP_SECONDS: "120"` under
`environment:` in Peek's compose file and restart Peek. Remove it again when you're done.
