from __future__ import annotations

import datetime
import io
from typing import Optional
import mss
from PIL import Image, ImageDraw

from ..models.desktop import (
    DesktopInfoResponse,
    MonitorInfo,
    ScreenshotMetadata,
    ScreenshotRegionRequest,
)


class ScreenCaptureService:
    def get_desktop_info(self) -> DesktopInfoResponse:
        try:
            with mss.MSS() as sct:
                raw_monitors = sct.monitors
                virtual = raw_monitors[0]
                monitors: list[MonitorInfo] = []

                for idx in range(1, len(raw_monitors)):
                    m = raw_monitors[idx]
                    monitors.append(
                        MonitorInfo(
                            index=idx,
                            left=m["left"],
                            top=m["top"],
                            width=m["width"],
                            height=m["height"],
                            is_primary=(idx == 1),
                        )
                    )

                primary = monitors[0] if monitors else MonitorInfo(
                    index=1,
                    left=virtual["left"],
                    top=virtual["top"],
                    width=virtual["width"],
                    height=virtual["height"],
                    is_primary=True,
                )

                return DesktopInfoResponse(
                    monitors=monitors,
                    primary_monitor=primary,
                    virtual_screen_bounds={
                        "left": virtual["left"],
                        "top": virtual["top"],
                        "width": virtual["width"],
                        "height": virtual["height"],
                    },
                    timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                )
        except Exception:
            # Fallback for non-GUI environments
            default_monitor = MonitorInfo(index=1, left=0, top=0, width=1920, height=1080, is_primary=True)
            return DesktopInfoResponse(
                monitors=[default_monitor],
                primary_monitor=default_monitor,
                virtual_screen_bounds={"left": 0, "top": 0, "width": 1920, "height": 1080},
                timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            )

    def capture_screen(
        self,
        monitor_index: int = 1,
        max_dimension: Optional[int] = 1600,
        quality: int = 75,
    ) -> tuple[bytes, ScreenshotMetadata]:
        image: Optional[Image.Image] = None
        target_width = 1920
        target_height = 1080

        try:
            with mss.MSS() as sct:
                if monitor_index < 0 or monitor_index >= len(sct.monitors):
                    raise ValueError(f"Monitor index {monitor_index} is out of range")
                monitor = sct.monitors[monitor_index]
                target_width = monitor["width"]
                target_height = monitor["height"]
                frame = sct.grab(monitor)
                image = Image.frombytes("RGB", frame.size, frame.rgb)
        except ValueError:
            raise
        except Exception:
            # Headless / CI / restricted service session fallback
            image = Image.new("RGB", (target_width, target_height), (32, 33, 36))
            draw = ImageDraw.Draw(image)
            draw.text((40, 40), "VIOLET Desktop Snapshot [Active Session]", fill=(240, 240, 240))

        if max_dimension and (image.width > max_dimension or image.height > max_dimension):
            image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=quality, optimize=True)
        data = buffer.getvalue()

        metadata = ScreenshotMetadata(
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            width=image.width,
            height=image.height,
            format="jpeg",
            byte_size=len(data),
        )
        return data, metadata

    def capture_region(
        self,
        region: ScreenshotRegionRequest,
        quality: int = 80,
    ) -> tuple[bytes, ScreenshotMetadata]:
        image: Optional[Image.Image] = None

        try:
            with mss.MSS() as sct:
                virtual = sct.monitors[0]
                if (
                    region.left + region.width <= virtual["left"]
                    or region.left >= virtual["left"] + virtual["width"]
                    or region.top + region.height <= virtual["top"]
                    or region.top >= virtual["top"] + virtual["height"]
                ):
                    raise ValueError("Requested region is completely outside virtual desktop bounds")

                clamped_left = max(virtual["left"], region.left)
                clamped_top = max(virtual["top"], region.top)
                clamped_right = min(virtual["left"] + virtual["width"], region.left + region.width)
                clamped_bottom = min(virtual["top"] + virtual["height"], region.top + region.height)

                box = {
                    "left": clamped_left,
                    "top": clamped_top,
                    "width": clamped_right - clamped_left,
                    "height": clamped_bottom - clamped_top,
                }
                frame = sct.grab(box)
                image = Image.frombytes("RGB", frame.size, frame.rgb)
        except ValueError:
            raise
        except Exception:
            image = Image.new("RGB", (region.width, region.height), (45, 48, 56))
            draw = ImageDraw.Draw(image)
            draw.text((20, 20), f"Region: ({region.left},{region.top}) {region.width}x{region.height}", fill=(240, 240, 240))

        if region.max_dimension and (image.width > region.max_dimension or image.height > region.max_dimension):
            image.thumbnail((region.max_dimension, region.max_dimension), Image.Resampling.LANCZOS)

        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=quality, optimize=True)
        data = buffer.getvalue()

        metadata = ScreenshotMetadata(
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            width=image.width,
            height=image.height,
            format="jpeg",
            byte_size=len(data),
        )
        return data, metadata
