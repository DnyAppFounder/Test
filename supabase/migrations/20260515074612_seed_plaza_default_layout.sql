/*
  # Seed DAWEN Plaza with a real room layout

  ## Summary
  Sets the official DAWEN Plaza room (id 00000000-0000-0000-0000-000000000001)
  with a structured layout that the native Room Builder can read and the
  room engine can render.

  ## Layout format
  - version: "1.0"
  - width x height: 16 x 14 tiles
  - tiles: 2D boolean array [col][row] — true = walkable floor
  - doors: array of door cutout positions on left or back wall
  - floor_style / wall_style: visual theme keys

  ## Notes
  - All tiles are walkable by default (open plaza)
  - Two door openings: one on the left wall (col=0) and one on the back wall (row=0)
*/

DO $$
DECLARE
  plaza_tiles jsonb;
  plaza_layout jsonb;
  col_idx int;
  row_idx int;
  row_arr jsonb;
  all_cols jsonb := '[]'::jsonb;
BEGIN
  -- Build 16x14 all-true tile grid (all walkable)
  FOR col_idx IN 0..15 LOOP
    row_arr := '[]'::jsonb;
    FOR row_idx IN 0..13 LOOP
      row_arr := row_arr || 'true'::jsonb;
    END LOOP;
    all_cols := all_cols || jsonb_build_array(row_arr);
  END LOOP;

  plaza_layout := jsonb_build_object(
    'version',     '1.0',
    'width',       16,
    'height',      14,
    'floor_style', 'tile',
    'wall_style',  'dark',
    'tiles',       all_cols,
    'doors',       jsonb_build_array(
      jsonb_build_object('col', 0,  'row', 6, 'wall', 'left'),
      jsonb_build_object('col', 7,  'row', 0, 'wall', 'back'),
      jsonb_build_object('col', 14, 'row', 0, 'wall', 'back')
    ),
    'builder_used', 'native',
    'is_plaza',     true
  );

  UPDATE world_rooms
  SET
    room_layout_data = plaza_layout,
    floor_data       = plaza_layout->'tiles',
    wall_data        = '{"style":"dark","left":true,"back":true}'::jsonb,
    door_data        = plaza_layout->'doors',
    room_width       = 16,
    room_height      = 14,
    builder_used     = 'native',
    layout_saved_at  = now(),
    updated_at       = now()
  WHERE id = '00000000-0000-0000-0000-000000000001';
END $$;
