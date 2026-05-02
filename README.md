# ESPHome FP2 Card

A standalone Home Assistant dashboard card for visualizing ESPHome Aqara FP2
radar entities. This repository is intended for HACS dashboard-card
installation only.

It includes:

- A HACS-compatible Lovelace card module: `card.js`
- Card configuration examples
- The Home Assistant entity/service contract the card expects

It intentionally does not include ESPHome firmware, flashing instructions,
firmware images, or reverse-engineering notes.

## Attribution

This card is inspired by the FP2 dashboard card documented in:

- <https://github.com/jmlab-net/esphome_fp2_ng>
- <https://github.com/JameZUK/esphome_fp2_ng>

Those upstream repositories did not declare a license at the time this
standalone repository was created, so this repository contains an original card
implementation rather than a copied upstream source file.

## HACS Installation

1. Open HACS.
2. Go to Frontend.
3. Open Custom repositories.
4. Add this repository URL as category `Dashboard`.
5. Install the card.
6. Reload Home Assistant frontend resources, or restart Home Assistant if HACS
   asks you to.

After installation, use:

```yaml
type: custom:aqara-fp2-card
entity_prefix: sensor.fp2_bedroom
title: Bedroom FP2
```

The module also registers `custom:esphome-fp2-card` as an alias.

## Manual Installation

Copy `card.js` to:

```text
/config/www/community/esphome_fp2_cardC/card.js
```

Add a dashboard resource:

```text
/local/community/esphome_fp2_cardC/card.js
```

Resource type:

```text
JavaScript module
```

## Card Options

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `entity_prefix` | Yes | none | Base FP2 sensor entity, such as `sensor.fp2_bedroom` |
| `title` | No | `Aqara FP2` | Card title |
| `display_mode` | No | `full` | `full` or `zoomed` |
| `show_grid` | No | `true` | Draw radar grid lines |
| `show_sensor_position` | No | `true` | Draw the FP2 sensor marker |
| `show_zone_labels` | No | `true` | Draw zone labels on the radar map |
| `auto_tracking` | No | `false` | Turn on target reporting when the card loads, then turn it back off when the card unloads |
| `map_config_service` | No | derived | ESPHome service name without the `esphome.` domain |
| `entities` | No | derived | Per-entity overrides |

Full entity and service details are in [docs/entity-contract.md](docs/entity-contract.md).

## Example

```yaml
type: custom:aqara-fp2-card
entity_prefix: sensor.fp2_bedroom
title: Bedroom FP2
display_mode: full
show_grid: true
show_sensor_position: true
show_zone_labels: true
auto_tracking: false
```

## Derived Defaults

For `entity_prefix: sensor.fp2_bedroom`, the card derives:

| Purpose | Default |
| --- | --- |
| Targets | `sensor.fp2_bedroom_targets` |
| Total people | `sensor.fp2_bedroom_total_people` |
| Global presence | `binary_sensor.fp2_bedroom_global_presence` |
| Report targets switch | `switch.fp2_bedroom_report_targets` |
| Map service | `esphome.fp2_bedroom_get_map_config` |

Override names when needed:

```yaml
type: custom:aqara-fp2-card
entity_prefix: sensor.fp2_bedroom
map_config_service: my_fp2_get_map_config
entities:
  targets: sensor.my_fp2_targets
  total_people: sensor.my_fp2_total_people
  global_presence: binary_sensor.my_fp2_presence
  report_targets: switch.my_fp2_report_targets
  radar_state: sensor.my_fp2_radar_state
  operating_mode: select.my_fp2_operating_mode
```

## Development

There is no build step. HACS serves `card.js` directly.
