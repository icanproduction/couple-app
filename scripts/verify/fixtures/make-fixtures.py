"""Generate synthetic JPEG fixtures for scripts/verify (no real photos).

    python3 scripts/verify/fixtures/make-fixtures.py

moment-gps.jpg   EXIF DateTimeOriginal 2026:09:14 19:30:00 + GPS at Monas,
                 Jakarta (-6.175392, 106.827153)
moment-plain.jpg same image, no EXIF at all (negative control)
"""
from pathlib import Path

from PIL import Image, ImageDraw
from PIL.TiffImagePlugin import IFDRational

HERE = Path(__file__).parent
LAT, LON = -6.175392, 106.827153


def dms(value: float):
    value = abs(value)
    deg = int(value)
    minutes_full = (value - deg) * 60
    minutes = int(minutes_full)
    seconds = round((minutes_full - minutes) * 60 * 10000)
    return (IFDRational(deg, 1), IFDRational(minutes, 1), IFDRational(seconds, 10000))


def make_image() -> Image.Image:
    img = Image.new("RGB", (800, 600), (255, 248, 240))
    draw = ImageDraw.Draw(img)
    for y in range(600):
        shade = int(107 + (y / 600) * 80)
        draw.line([(0, y), (800, y)], fill=(240, shade, shade))
    draw.ellipse([300, 200, 500, 400], fill=(255, 248, 240))
    draw.text((330, 290), "fixture", fill=(45, 36, 36))
    return img


exif = Image.Exif()
exif[0x010F] = "Fixture"                       # Make
exif[0x0132] = "2026:09:14 19:30:00"           # DateTime
exif_ifd = exif.get_ifd(0x8769)
exif_ifd[0x9003] = "2026:09:14 19:30:00"       # DateTimeOriginal
gps = exif.get_ifd(0x8825)
gps[0] = b"\x02\x03\x00\x00"                   # GPSVersionID
gps[1] = "S" if LAT < 0 else "N"
gps[2] = dms(LAT)
gps[3] = "E" if LON > 0 else "W"
gps[4] = dms(LON)

make_image().save(HERE / "moment-gps.jpg", quality=80, exif=exif)
make_image().save(HERE / "moment-plain.jpg", quality=80)
print("fixtures written")
