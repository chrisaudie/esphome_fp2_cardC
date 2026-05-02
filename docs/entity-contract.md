# Entity Contract

This card expects an ESPHome FP2 device that exposes radar map and target data
to Home Assistant. It does not include ESPHome firmware or flashing
instructions.

## Card Config

```yaml
type: custom:aqara-fp2-card
entity_prefix: sensor.fp2_bedroom
title: Bedroom FP2
```

`entity_prefix` is the base sensor entity used to derive default entity names.
For `sensor.fp2_bedroom`, the card looks for these entities:

| Purpose | Default entity |
| --- | --- |
| Encoded target stream | `sensor.fp2_bedroom_targets` |
| Total people count | `sensor.fp2_bedroom_total_people` |
| Global presence | `binary_sensor.fp2_bedroom_global_presence` |
| Report targets toggle | `switch.fp2_bedroom_report_targets` |
| Radar state | `sensor.fp2_bedroom_radar_state` |
| Operating mode | `select.fp2_bedroom_operating_mode` |

Override any derived entity when your names differ:

```yaml
type: custom:aqara-fp2-card
entity_prefix: sensor.fp2_bedroom
entities:
  targets: sensor.custom_targets
  total_people: sensor.custom_total_people
  global_presence: binary_sensor.custom_global_presence
  report_targets: switch.custom_report_targets
  radar_state: sensor.custom_radar_state
  operating_mode: select.custom_operating_mode
```

## Map Config Service

By default the card calls the ESPHome service
`esphome.<device_name>_get_map_config`, where `<device_name>` is derived from
`entity_prefix`.

For `sensor.fp2_bedroom`, the default service is:

```yaml
esphome.fp2_bedroom_get_map_config
```

Override it when needed:

```yaml
type: custom:aqara-fp2-card
entity_prefix: sensor.fp2_bedroom
map_config_service: fp2_bedroom_get_map_config
```

The service response should contain:

| Key | Description |
| --- | --- |
| `edge_grid` | 14x14 room-boundary mask, encoded as hex rows or ASCII grid |
| `exit_grid` | 14x14 entry/exit mask |
| `interference_grid` | 14x14 interference-source mask |
| `mounting_position` | `wall`, `left_corner`, `right_corner`, `left_upper_corner`, or `right_upper_corner` |
| `zones` | Array of zone definitions |

Each zone may include:

| Key | Description |
| --- | --- |
| `name` | Display label |
| `presence_sensor` | Zone presence entity object id or full entity id |
| `grid` | 14x14 zone mask, encoded as hex rows or ASCII grid |

## Exposed Entity Reference

The card can display these global entities when present:

| Config key | Home Assistant domain | Description |
| --- | --- | --- |
| `people_count` | `sensor` | Total detected people |
| `target_tracking` | `sensor` | Encoded target locations |
| `location_report_switch` | `switch` | Enables live target reporting |
| `global_zone.presence` | `binary_sensor` | Overall occupancy |
| `global_zone.motion` | `binary_sensor` | Overall motion |
| `radar_state` | `sensor` | Radar lifecycle/status |
| `operating_mode` | `select` | Zone, fall, sleep, or positioning mode |
| `walking_distance` | `sensor` | Cumulative walking distance |
| `sleep_state` | `sensor` | Awake/light/deep sleep state |
| `sleep_presence` | `binary_sensor` | Sleep-zone occupancy |
| `heart_rate` | `sensor` | Heart rate |
| `respiration_rate` | `sensor` | Respiration rate |
| `heart_rate_deviation` | `sensor` | Derived heart-rate variation |
| `fall_detection` | `binary_sensor` | Fall event state |

Per-zone entities:

| Config key | Home Assistant domain | Description |
| --- | --- | --- |
| `presence` | `binary_sensor` | Zone occupancy |
| `motion` | `binary_sensor` | Zone motion |
| `zone_people_count` | `sensor` | Native per-zone people count |
| `posture` | `sensor` | Standing, sitting, or lying posture |
