"""Assemble chez_spoons.html : gabarit + règles métier (core.js) + logo intégré."""
import base64
from pathlib import Path

ICI = Path(__file__).parent
gabarit = (ICI / "chez_spoons.template.html").read_text(encoding="utf-8")
core = (ICI / "core.js").read_text(encoding="utf-8")
logo = "data:image/png;base64," + base64.b64encode((ICI / "logo_chez_spoons.png").read_bytes()).decode()
# SheetJS 0.18.5 (Apache 2.0) intégré pour lire les .xls Booking sans connexion internet
xlsx = (ICI / "vendor" / "xlsx.full.min.js").read_text(encoding="utf-8")
favicon = "data:image/png;base64," + base64.b64encode((ICI / "favicon.png").read_bytes()).decode()
html = gabarit.replace("FAVICON_DATA_URI", favicon).replace("/*XLSX*/", xlsx).replace("/*CORE*/", core).replace("LOGO_DATA_URI", logo)
(ICI / "chez_spoons.html").write_text(html, encoding="utf-8")
print(f"chez_spoons.html : {len(html) // 1024} Ko")
