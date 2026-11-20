"""Bake articulated monster walks from the idle and attack poses in the game atlas.

Usage: python tools/monster_walk.py INPUT_DIRECTORY OUTPUT_DIRECTORY
Requires Pillow and NumPy. INPUT_DIRECTORY may contain the original or updated atlases.
"""

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


WALK_FRAMES = 36
TOTAL_FRAMES = WALK_FRAMES + 4
COLUMNS = 20
OLD_TOTAL_FRAMES = 28
VIEWS = 8

# In each drawing the chains run from hip to knee to ankle. Far legs come first.
RIGS = {
    "boar": {
        0: [(22,42,23,47,22,51), (33,42,31,46,32,50), (19,42,16,47,16,53), (35,42,33,47,34,53)],
        1: [(22,40,19,46,20,50), (38,43,38,48,39,52), (27,43,27,47,28,49), (31,44,30,49,31,53)],
        2: [(26,42,25,47,26,53), (36,42,37,47,36,53)],
        5: [(26,40,24,45,25,50), (37,44,40,48,42,51), (34,43,33,48,34,53)],
        6: [(28,41,26,47,26,53), (36,41,37,47,36,53)],
    },
    "skeleton": {
        0: [(28,35,27,41,27,49)],
        1: [(32,35,33,41,35,46), (28,35,26,42,27,49)],
        2: [(27,34,25,42,25,48), (31,34,33,42,34,48)],
        5: [(33,34,34,41,34,47), (28,35,25,41,25,49)],
        6: [(26,34,24,42,25,49), (33,34,34,42,35,49)],
    },
    "dragon": {
        0: [(47,61,47,70,49,79), (67,60,75,71,79,81), (36,60,27,71,27,82), (60,61,60,73,63,84)],
        1: [(31,58,23,69,26,78), (46,59,43,69,46,75), (65,60,72,72,80,82), (54,60,54,72,55,84)],
        2: [(32,57,27,67,25,76), (64,57,69,67,69,76), (35,57,36,71,36,84), (61,57,58,71,58,84)],
        5: [(30,54,24,65,19,73), (45,56,42,65,39,72), (65,59,62,71,65,80), (45,59,43,73,42,84)],
        6: [(34,56,29,65,29,72), (62,56,67,65,67,72), (36,57,36,70,36,80), (60,57,60,70,61,80)],
    },
    "imp": {
        0: [(26,32,30,38,25,44)],
        1: [(31,32,33,39,33,44), (24,32,22,39,22,45)],
        2: [(24,32,20,39,21,45), (31,32,34,39,33,45)],
        5: [(29,32,31,39,32,44), (24,32,20,39,22,45)],
        6: [(23,32,20,39,21,45), (31,32,33,39,34,45)],
    },
    "hound": {
        0: [(23,41,24,47,26,54), (42,39,47,49,49,55), (19,40,15,49,18,56), (39,39,39,49,42,57)],
        1: [(31,41,30,45,33,48), (23,39,22,46,24,51), (40,40,44,48,47,54), (34,40,35,49,38,57)],
        2: [(26,39,25,44,25,49), (41,39,41,44,41,49), (29,39,28,50,29,57), (38,39,37,50,38,57)],
        5: [(24,38,23,44,21,50), (42,41,44,46,46,50), (38,40,38,49,40,55), (31,40,32,51,33,57)],
        6: [(27,38,25,44,25,49), (40,38,41,44,41,49), (28,40,27,50,28,57), (38,40,39,50,38,57)],
    },
    "fiend": {
        0: [(34,43,32,52,36,61)],
        1: [(40,44,40,53,42,60), (29,44,28,54,29,61)],
        2: [(29,44,26,54,26,61), (43,44,45,54,44,61)],
        5: [(41,44,42,54,42,61), (30,44,28,54,28,61)],
        6: [(29,44,26,54,27,61), (43,44,46,54,45,61)],
    },
}

# Frame size, stride in world pixels, stance fraction, lift, hip drop, roll, leg phases.
GAITS = {
    "boar": (64, 23, .57, 3.7, 1.2, 1.6, (.00, .50, .50, .00)),
    "skeleton": (60, 27, .61, 5.8, .8, 2.4, (.00, .50)),
    "dragon": (96, 49, .72, 6.2, 2.3, 1.7, (.00, .52, .69, .23)),
    "imp": (56, 32, .40, 5.2, 1.4, 3.6, (.00, .14)),
    "hound": (68, 41, .43, 6.9, 1.8, 4.3, (.04, .58, .20, .76)),
    "fiend": (72, 43, .68, 5.9, 1.9, 2.8, (.00, .50)),
}


def closed_curve(t):
    return t * t * (3 - 2 * t)


def chains_for(species, view, size):
    mirror = {3: 1, 4: 0, 7: 5}
    chains = np.asarray(RIGS[species][mirror.get(view, view)], dtype=float).reshape(-1, 3, 2)
    if view in mirror:
        chains[:, :, 0] = size - 1 - chains[:, :, 0]
    return chains


def bone_distance(x, y, first, last):
    bone = last - first
    t = np.clip(((x - first[0]) * bone[0] + (y - first[1]) * bone[1]) / (bone @ bone), 0, 1)
    return np.hypot(x - first[0] - t * bone[0], y - first[1] - t * bone[1])


def split_skin(image, chains, species):
    rgba = np.asarray(image).copy()
    y, x = np.indices(rgba.shape[:2])
    radii = {"boar": (4.1, 3.5), "skeleton": (2.5, 2.2), "dragon": (7.8, 6.4),
             "imp": (4.1, 3.4), "hound": (4.5, 4.0), "fiend": (5.8, 5.3)}[species]
    owners = []
    for hip, knee, ankle in chains:
        upper = bone_distance(x, y, hip, knee) / radii[0]
        lower = bone_distance(x, y, knee, ankle) / radii[1]
        owners.append(np.where(y >= hip[1] + 1, np.minimum(upper, lower), 10))
    distances = np.asarray(owners)
    nearest = np.argmin(distances, axis=0)
    removed = np.min(distances, axis=0) <= 1.18
    body = rgba.copy()
    body[removed, 3] = 0
    legs = []
    for index, (hip, knee, ankle) in enumerate(chains):
        owned = (nearest == index) & removed
        # Overlap the two textures around the knee so a bend cannot open a gap.
        overlap = radii[1] * .72
        foot_line = ankle[1] - .65
        leg = []
        for mask in (y <= knee[1] + overlap, (y >= knee[1] - overlap) & (y <= foot_line + 1),
                     y >= foot_line - 1):
            skin = rgba.copy()
            skin[~(owned & mask), 3] = 0
            leg.append(Image.fromarray(skin))
        legs.append(leg)
    return Image.fromarray(body), legs


def rotate(theta):
    c, s = math.cos(theta), math.sin(theta)
    return np.asarray(((c, -s), (s, c)))


def transformed(image, origin, target, matrix, resolution):
    linear = np.linalg.inv(matrix * resolution)
    translation = origin - linear @ (target * resolution)
    return image.transform(
        (image.width * resolution, image.height * resolution),
        Image.Transform.AFFINE,
        (linear[0, 0], linear[0, 1], translation[0], linear[1, 0], linear[1, 1], translation[1]),
        Image.Resampling.BICUBIC,
    )


def move_bone(image, old_a, old_b, new_a, new_b, resolution):
    old = old_b - old_a
    new = new_b - new_a
    scale = np.linalg.norm(new) / np.linalg.norm(old)
    angle = math.atan2(new[1], new[0]) - math.atan2(old[1], old[0])
    return transformed(image, old_a, new_a, rotate(angle) * scale, resolution)


def bend_knee(chain, root, foot, forward):
    hip, knee, ankle = chain
    thigh = np.linalg.norm(knee - hip) * 1.045
    shin = np.linalg.norm(ankle - knee) * 1.045
    vector = foot - root
    distance = np.linalg.norm(vector)
    axis = vector / max(.01, distance)
    distance = np.clip(distance, abs(thigh - shin) + .12, thigh + shin - .16)
    side = np.asarray((-axis[1], axis[0]))
    source_axis = ankle - hip
    bend = source_axis[0] * (knee[1] - hip[1]) - source_axis[1] * (knee[0] - hip[0])
    sign = math.copysign(1, bend) if abs(bend) >= 1 else math.copysign(1, -forward[0] or 1)
    projection = (thigh**2 - shin**2 + distance**2) / (2 * distance)
    lift = math.sqrt(max(0, thigh**2 - projection**2))
    # A bend facing the camera projects into depth instead of spreading the legs sideways.
    side[0] *= .22 + .78 * abs(forward[0])
    return root + axis * projection + side * lift * sign, root + axis * distance


def phase_foot(phase, stance, stride, lift):
    if phase < stance:
        return stride * (stance / 2 - phase), 0.0, 0.0
    swing = (phase - stance) / (1 - stance)
    reach = stride * stance * (closed_curve(swing) - .5)
    return reach, lift * math.sin(math.pi * swing) ** 1.35, math.sin(math.tau * swing)


def animate(image, species, view):
    size, stride, stance, swing, drop, roll, phases = GAITS[species]
    forward = np.array((math.cos(view * math.pi / 4), math.sin(view * math.pi / 4) * .42))
    chains = chains_for(species, view, size)
    body, skins = split_skin(image, chains, species)
    is_profile = len(chains) == 1
    if is_profile:
        # The second leg is occluded in the side view of these original drawings.
        # Reuse its texture behind the near leg at a slightly higher floor anchor.
        chains = np.repeat(chains, 2, axis=0)
        near = skins[0]
        far_layers = [Image.blend(layer, Image.new("RGBA", layer.size, "#171827"), .26)
                      for layer in near]
        for far, original in zip(far_layers, near):
            far.putalpha(original.getchannel("A"))
        skins = [far_layers, near]

    resolution = 2
    pivot = np.mean(chains[:, 0], axis=0)
    output = []
    for index in range(WALK_FRAMES):
        t = index / WALK_FRAMES
        beat = math.sin(math.tau * t)
        airborne = 0.0
        if species == "imp":
            airborne = 5.8 * math.sin(math.pi * np.clip((t - .37) / .60, 0, 1)) ** 1.15
        if species == "hound":
            airborne = max(0, beat) * 3.4
        bob = drop * (.5 + .5 * math.cos(math.tau * t * 2)) - airborne
        matrix = rotate(math.radians(roll * beat * max(.28, abs(forward[0]))))
        target = pivot + (beat * .6, bob)
        frame = Image.new("RGBA", (size * resolution, size * resolution))
        rendered = []
        for leg, (chain, pieces) in enumerate(zip(chains, skins)):
            hip, knee, ankle = chain
            phase_index = leg
            if len(chains) < len(phases) and species in ("boar", "hound", "dragon"):
                phase_index = (0, 2, 3)[leg] if len(chains) == 3 else (2, 3)[leg]
            phase = (t + phases[phase_index]) % 1
            length = np.linalg.norm(knee - hip) + np.linalg.norm(ankle - knee)
            limit = length * (1.57 if species == "dragon" else 1.9)
            reach, lift, pitch = phase_foot(phase, stance, min(stride, limit), swing)
            offset = -2.2 if is_profile and leg == 0 else 0
            root = target + matrix @ (hip - pivot) + (0, offset)
            foot = ankle + forward * reach + (0, offset - lift - airborne * .75)
            new_knee, new_ankle = bend_knee(chain, root, foot, forward)
            layer = Image.new("RGBA", frame.size)
            layer.alpha_composite(move_bone(pieces[0], hip, knee, root, new_knee, resolution))
            layer.alpha_composite(move_bone(pieces[1], knee, ankle, new_knee, new_ankle, resolution))
            layer.alpha_composite(transformed(pieces[2], ankle, new_ankle, rotate(pitch * -.23 * forward[0]), resolution))
            rendered.append(layer)
        for layer in rendered:
            frame.alpha_composite(layer)
        frame.alpha_composite(transformed(body, pivot, target, matrix, resolution))
        output.append(frame.resize(image.size, Image.Resampling.LANCZOS))
    return output


def open_pose(atlas, size, columns, index):
    x, y = index % columns * size, index // columns * size
    return atlas.crop((x, y, x + size, y + size))


def build(source, destination, species):
    size = GAITS[species][0]
    original = Image.open(source / f"{species}.png").convert("RGBA")
    columns = original.width // size
    original_frames = columns * (original.height // size) // VIEWS
    if original_frames not in (OLD_TOTAL_FRAMES, TOTAL_FRAMES):
        raise ValueError(f"Unexpected atlas layout: {species}, {original.size}")
    atlas = Image.new("RGBA", (size * COLUMNS, size * TOTAL_FRAMES * VIEWS // COLUMNS))
    sequences = []
    for view in range(VIEWS):
        first_slot = view * original_frames
        idle = open_pose(original, size, columns, first_slot)
        walk = animate(idle, species, view)
        if len({frame.tobytes() for frame in walk}) != WALK_FRAMES:
            raise ValueError(f"Repeated walking frames: {species}, view {view}")
        attacks = [open_pose(original, size, columns, first_slot + original_frames - 3 + index) for index in range(3)]
        for offset, texture in enumerate([idle, *walk, *attacks]):
            slot = view * TOTAL_FRAMES + offset
            atlas.paste(texture, (slot % COLUMNS * size, slot // COLUMNS * size))
        sequences.append(walk)
    atlas.save(destination / f"{species}.png", optimize=True)
    return sequences


def preview(sequences, folder):
    names = dict(boar="Sanglier", skeleton="Squelette", dragon="Saphyr", imp="Diablotin",
                 hound="Molosse", fiend="Garde")
    frames = []
    try:
        font = ImageFont.truetype("segoeui.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for index in range(WALK_FRAMES):
        canvas = Image.new("RGBA", (864, 530), "#151923")
        draw = ImageDraw.Draw(canvas)
        for cell, (species, views) in enumerate(sequences.items()):
            x, y = cell % 3 * 288, cell // 3 * 265
            draw.rounded_rectangle((x + 5, y + 5, x + 282, y + 258), radius=10, fill="#222838")
            draw.text((x + 15, y + 14), names[species], font=font, fill="#f4e8d5")
            draw.line((x + 22, y + 225, x + 266, y + 225), fill="#414c65", width=1)
            view = 0 if cell % 2 == 0 else 1
            step = views[view][index]
            size = step.width
            canvas.alpha_composite(step.resize((size * 3, size * 3), Image.Resampling.NEAREST),
                                   (x + 144 - size * 3 // 2, y + 225 - (size - 10) * 3))
        frames.append(canvas)
    frames[0].save(folder / "foulees-articulees.png", save_all=True, append_images=frames[1:], duration=34, loop=0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--preview", type=Path)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    sequences = {species: build(args.source, args.destination, species) for species in GAITS}
    if args.preview:
        args.preview.mkdir(parents=True, exist_ok=True)
        preview(sequences, args.preview)
    print(f"{len(sequences)} species, {VIEWS} views, {WALK_FRAMES} unique walking frames per view")


if __name__ == "__main__":
    main()
