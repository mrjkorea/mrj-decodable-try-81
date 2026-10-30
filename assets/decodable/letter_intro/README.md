# Letter-intro videos (books 81–100)

Each book plays one letter-intro video after the sound card and before the famous word:

```
sound card → letter intro → famous-word card → famous word → (chase) → Listen
```

The video fills the intro stage edge to edge. **Next** unlocks when the video ends.

## Files

The 20 mp4s live in this folder (release `letter-intros-wire-20261030`). Do not rename or re-encode them.

| Book | File | Sound |
|---|---|---|
| mlr_dec_081 | `silent_t_letter_intro.mp4` | silent t |
| mlr_dec_082 | `soft_c_letter_intro.mp4` | soft c |
| mlr_dec_083 | `soft_g_letter_intro.mp4` | soft g |
| mlr_dec_084 | `ch_k_letter_intro.mp4` | ch /k/ |
| mlr_dec_085 | `o_short_u_letter_intro.mp4` | o /uh/ |
| mlr_dec_086 | `tion_letter_intro.mp4` | -tion |
| mlr_dec_087 | `sion_letter_intro.mp4` | -sion |
| mlr_dec_088 | `ture_letter_intro.mp4` | -ture |
| mlr_dec_089 | `ie_ee_letter_intro.mp4` | ie field |
| mlr_dec_090 | `ie_ai_letter_intro.mp4` | ie pie |
| mlr_dec_091 | `ui_letter_intro.mp4` | ui |
| mlr_dec_092 | `gn_letter_intro.mp4` | gn |
| mlr_dec_093 | `silent_h_letter_intro.mp4` | silent h |
| mlr_dec_094 | `sc_s_letter_intro.mp4` | sc /s/ |
| mlr_dec_095 | `cian_letter_intro.mp4` | ti / ci |
| mlr_dec_096 | `age_letter_intro.mp4` | -age |
| mlr_dec_097 | `ous_letter_intro.mp4` | -ous |
| mlr_dec_098 | `y_short_i_letter_intro.mp4` | y gym |
| mlr_dec_099 | `gh_f_letter_intro.mp4` | gh /f/ |
| mlr_dec_100 | `eigh_letter_intro.mp4` | eigh |

## How the app finds them

- `assets/align_mlr_dec_0NN.json` lists the file names in `"letter_intros"`.
- `LETTER_INTRO` in `index.html` holds the same names. The app uses it when an align file has no
  `letter_intros` (for example a stale cached copy).
- Each name is loaded with `asset('decodable/letter_intro/<file>')`, which gives
  `assets/decodable/letter_intro/<file>?v=<ASSET_V>`.

If a file is missing or will not play, the app skips to the famous word.

After deploy, open a book from 81–100 and tap Next on the sound card. The video should play full screen
width and Next should unlock at the end. `test/letter-intro.test.js` checks that every mp4 here is on
the list above and is a real MP4 file.
