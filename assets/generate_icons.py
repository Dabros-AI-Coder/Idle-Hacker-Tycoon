from PIL import Image, ImageDraw, ImageFont
import os

# Target sizes
sizes = {
    "icon-512.png": 512,
    "icon-192.png": 192,
    "apple-touch-icon.png": 180,
    "icon-32.png": 32,
    "favicon.png": 32,
}

BG = (10, 14, 26)          # #0a0e1a
CARD = (19, 26, 46)        # #131a2e
BORDER = (30, 42, 74)      # #1e2a4a
ACCENT = (0, 255, 136)     # #00ff88
ACCENT_DIM = (0, 204, 106)
TEXT_DIM = (148, 163, 184)

# Try to load monospace fonts
def load_font(size, bold=False):
    candidates = [
        r"C:\Windows\Fonts\consola.ttf",
        r"C:\Windows\Fonts\Consolas.ttf",
        r"C:\Windows\Fonts\CascadiaMono.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except: pass
    return ImageFont.load_default()

def rounded_rect_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0,0,size-1,size-1], radius=radius, fill=255)
    return mask

def render_icon(size):
    radius = int(size * 0.219)  # 224/1024
    img = Image.new("RGBA", (size, size), (0,0,0,0))
    draw = ImageDraw.Draw(img)

    # Background
    draw.rounded_rectangle([0,0,size-1,size-1], radius=radius, fill=BG, outline=BORDER, width=max(1, size//256*2))

    # Inner card gradient approx: draw slightly inset rect with CARD color
    inset = max(2, size//512*2)
    draw.rounded_rectangle([inset,inset,size-1-inset,size-1-inset], radius=radius-inset, fill=CARD)

    # Grid subtle: draw light lines every ~48/1024 = *size
    step = max(8, int(size * 48 / 1024))
    grid_color = (0,255,136, 18)  # very faint
    # Use overlay by drawing lines with alpha
    grid = Image.new("RGBA", (size,size), (0,0,0,0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, size, step):
        gd.line([(x,0),(x,size)], fill=(0,255,136,12), width=1)
    for y in range(0, size, step):
        gd.line([(0,y),(size,y)], fill=(0,255,136,8), width=1)
    # Mask grid to rounded rect
    mask = rounded_rect_mask(size, radius)
    img = Image.alpha_composite(img, grid)

    # Glow circle behind ring
    glow_size = int(size*0.58)
    glow = Image.new("RGBA", (size,size), (0,0,0,0))
    gdraw = ImageDraw.Draw(glow)
    cx, cy = size//2, int(size*0.527)  # 540/1024
    # draw glow as ellipse with low alpha
    for r in range(glow_size//2, 0, -2):
        alpha = int(28 * (1 - r/(glow_size//2)) )
        gdraw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(0,255,136, alpha))
    img = Image.alpha_composite(img, glow)

    # Neon ring
    draw = ImageDraw.Draw(img)
    ring_r = int(size * 222 / 1024)
    ring_w = max(2, int(size*10/1024))
    # Outer glow: draw larger ring with low alpha first
    for w in range(ring_w+6, ring_w, -1):
        alpha = int(40 * (1 - (w-ring_w)/6))
        draw.ellipse([cx-ring_r, cy-ring_r, cx+ring_r, cy+ring_r], outline=(0,255,136, alpha), width=w)
    draw.ellipse([cx-ring_r, cy-ring_r, cx+ring_r, cy+ring_r], outline=ACCENT, width=ring_w)
    # Inner dark fill
    inner_r = ring_r - ring_w - max(2, size//300)
    draw.ellipse([cx-inner_r, cy-inner_r, cx+inner_r, cy+inner_r], fill=BG, outline=BORDER, width=max(1, size//500))

    # Text </> centered
    try:
        # Choose font size: 210/1024 * size ~ 0.205*size
        font_size = int(size * 0.195)
        font = load_font(font_size)
        text = "</>"
        # Anchor middle
        bbox = draw.textbbox((0,0), text, font=font, anchor="mm")
        # But we need to place at cx, cy+? original y 585 vs cy 540 => +45
        tx, ty = cx, cy + int(size*0.044)
        # Draw glow first
        for dx in [-1,0,1]:
            for dy in [-1,0,1]:
                if dx==0 and dy==0: continue
                draw.text((tx+dx, ty+dy), text, font=font, fill=(0,255,136,80), anchor="mm")
        draw.text((tx, ty), text, font=font, fill=ACCENT, anchor="mm")
        # Cursor block
        # Estimate text width to place cursor after >
        tw = bbox[2]-bbox[0]
        cursor_w = int(size*0.035)
        cursor_h = int(size*0.018)
        cursor_x = tx + tw//2 + int(size*0.012)
        cursor_y = ty + int(size*0.045)
        # glow for cursor
        draw.rounded_rectangle([cursor_x-1, cursor_y-1, cursor_x+cursor_w+1, cursor_y+cursor_h+1], radius=2, fill=(0,255,136,60))
        draw.rounded_rectangle([cursor_x, cursor_y, cursor_x+cursor_w, cursor_y+cursor_h], radius=2, fill=ACCENT)
    except Exception as e:
        print(f"Text draw error size {size}: {e}")
        # fallback: simple
        pass

    # Corner brackets (4 corners)
    bw = max(2, int(size*8/1024))
    blen = int(size*0.12)
    br = radius
    # top-left
    draw.line([(int(size*0.086), int(size*0.086+blen)), (int(size*0.086), int(size*0.086)), (int(size*0.086+blen), int(size*0.086))], fill=ACCENT, width=bw, joint="round")
    # top-right
    draw.line([(int(size*0.914-blen), int(size*0.086)), (int(size*0.914), int(size*0.086)), (int(size*0.914), int(size*0.086+blen))], fill=ACCENT, width=bw)
    # bottom-right
    draw.line([(int(size*0.914), int(size*0.914-blen)), (int(size*0.914), int(size*0.914)), (int(size*0.914-blen), int(size*0.914))], fill=ACCENT, width=bw)
    # bottom-left
    draw.line([(int(size*0.086+blen), int(size*0.914)), (int(size*0.086), int(size*0.914)), (int(size*0.086), int(size*0.914-blen))], fill=ACCENT, width=bw)

    # Apply rounded mask
    mask = rounded_rect_mask(size, radius)
    # Ensure corners are transparent outside
    out = Image.new("RGBA", (size,size), (0,0,0,0))
    out.paste(img, (0,0), mask)
    return out

base = os.path.dirname(__file__)
for fname, sz in sizes.items():
    im = render_icon(sz)
    path = os.path.join(base, fname)
    im.save(path, "PNG")
    print(f"Saved {fname} {sz}x{sz} -> {path} ({os.path.getsize(path)} bytes)")

# Also save 512 as icon-512 already, duplicate for icon.png
print("Done")
