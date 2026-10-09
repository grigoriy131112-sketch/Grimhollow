#!/usr/bin/env bash
# Rebuild client/public/audio from raw CC0 sources (Wave W-AUDIO).
#
# Requires ffmpeg with libvorbis and the `loudnorm` filter (ffmpeg >= 4.1).
# Put the unzipped OpenGameArt downloads under $SRC (see SOURCES.md for which
# content page each file comes from), then run this script. The output is mono
# OGG Vorbis; music is trimmed to a ~72s loop with short fades, SFX to under 4s.
#
#   SRC=/tmp/audio-src bash scripts/audio/encode.sh
set -u

SRC="${SRC:-/tmp/audio-src}"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/client/public/audio"
mkdir -p "$OUT"

# name:source  (paths are relative to $SRC)
MUSIC="
menu:ambientmain_0.ogg
world:the_field_of_dreams.mp3
location:dungeon002_0.ogg
settlement:TownTheme.mp3
battle:fight.ogg
sea:Cleyton RX - Underwater_0.mp3
port:The_Old_Tower_Inn.mp3
tavern:menu_awesomeness.wav
temple:CrEEP.ogg
forest:cave_themeb4.ogg
marsh:forest.ogg
waste:caravan.ogg.ogg
coast:Forgoten_tombs_1.mp3
bonefield:boss_battle.wav
snow:Snowfall (Looped ver.)_0.ogg
campaign:x_Alexander Ehlers - Free Music Pack/Alexander Ehlers - Free Music Pack/Alexander Ehlers - Great mission.mp3
"
SFX="
ui_click:x_UI_SFX_Set/click1.wav
ui_back:x_UI_SFX_Set/click2.wav
hit:x_80-CC0-RPG-SFX_0/blade_01.ogg
miss:x_battle_sound_effects_0/battle_sound_effects/swish_2.wav
crit:x_80-CC0-RPG-SFX_0/blade_03.ogg
loot:x_80-CC0-RPG-SFX_0/item_gem_01.ogg
level_up:x_SoundPack01/Rise07.aif
death:x_80-CC0-RPG-SFX_0/creature_die_01.ogg
coin:x_80-CC0-RPG-SFX_0/item_coins_01.ogg
open:x_RPGsounds_Kenney/OGG/doorOpen_1.ogg
cannon:x_80-CC0-RPG-SFX_0/spell_fire_01.ogg
splash:x_rpg_sound_pack/RPG Sound Pack/inventory/bubble2.wav
"

enc() {
  local name="$1" src="$2" music="$3"
  if [ ! -f "$SRC/$src" ]; then echo "skip $name (missing $src)"; return; fi
  if [ "$music" = music ]; then
    ffmpeg -nostdin -y -v error -i "$SRC/$src" -t 72 \
      -af "aformat=channel_layouts=mono,loudnorm=I=-18:TP=-1.5:LRA=11,afade=t=in:d=0.4,afade=t=out:st=70.8:d=1.2" \
      -c:a libvorbis -q:a 4 "$OUT/$name.ogg"
  else
    ffmpeg -nostdin -y -v error -i "$SRC/$src" -t 4 \
      -af "aformat=channel_layouts=mono,loudnorm=I=-15:TP=-1.5:LRA=8" \
      -c:a libvorbis -q:a 4 "$OUT/$name.ogg"
  fi
  echo "ok $name.ogg"
}

echo "$MUSIC" | while IFS=: read -r name src; do [ -n "$name" ] && enc "$name" "$src" music; done
echo "$SFX"   | while IFS=: read -r name src; do [ -n "$name" ] && enc "$name" "$src" sfx;   done

echo "done -> $OUT"
