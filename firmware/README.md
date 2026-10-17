# Peek frame firmware

`peek-frame.yaml` turns a Seeed XIAO ePaper EE04 board with the 7.3" Spectra 6 panel into a Peek frame. It is an
[ESPHome](https://esphome.io) configuration, so there is no code to write: ESPHome builds the firmware from it.

On every wake the frame joins Wi-Fi, downloads `/frame.png` from Peek, draws it (about 30 seconds), asks
`/api/sleep` how long to wait and goes into deep sleep until then. If Peek can't be reached it tries again after
15 minutes and keeps showing the last picture.

## Before you start

- Put the EE04's jumper on the side of the connector your screen's ribbon uses (24-pin or 50-pin), then plug in
  the ribbon and the battery. Seeed warns that the wrong jumper can damage the screen.
- Peek must be running, and reachable from your phone on the same Wi-Fi at `http://<your computer's IP>:8080/frame.png`.
- Install ESPHome: `brew install esphome` on a Mac, or `pip install esphome` elsewhere.

## Flash it

```sh
cp firmware/secrets.example.yaml firmware/secrets.yaml   # then fill in Wi-Fi and Peek's address
esphome run firmware/peek-frame.yaml
```

Connect the board with a USB-C data cable first and pick its USB port when ESPHome asks. The first build takes
5 to 10 minutes. If the board isn't found, hold **B** (boot) on the XIAO, tap **R** (reset), let go of **B** and run
the command again. Afterwards ESPHome shows the frame's log.

## Updating it later

A sleeping frame can't be reached over Wi-Fi. Press **KEY0**: the frame wakes, shows the current picture and stays
awake for 5 minutes. Run `esphome run firmware/peek-frame.yaml` in that time and choose the Wi-Fi option.

## Testing

To make the frame wake every 2 minutes instead of at each refresh, add `PEEK_SLEEP_SECONDS: "120"` under
`environment:` in Peek's compose file and restart Peek. Remove it again when you're done.
