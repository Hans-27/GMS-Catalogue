# Live Catalogue Stock Design

## Goal

Every product shown inside a catalogue must use the latest valid ERP stock for every account type: SuperAdmin, Sales Admin, Sales, and Customer.

## Approved behaviour

- The backend synchronizes ERP product and warehouse stock every 180 seconds.
- Catalogue membership, layout, text, images, and prices keep their existing publishing/version rules.
- Stock is operational data and is never frozen in a catalogue version, even when the catalogue uses fixed/snapshot pricing.
- Authenticated previews, Catalogue Studio previews, published share links, customer catalogue links, and PDFs resolve stock from the central synchronized Product record.
- Open catalogue screens refresh in the background every 180 seconds without replacing the page with a loading state.
- Role and account catalogue visibility is unchanged: Sales and Customer accounts continue to see only their permitted published catalogues.
- A failed ERP synchronization preserves the last valid stock. The catalogue must not replace stock with zero merely because ERP is unavailable.
- Authored visibility remains respected: live stock updates stock fields already present in a design, but does not force a hidden stock field into a layout.

## Architecture

ERP stock is copied into the local product mirror by the existing synchronization worker. All catalogue presentation paths bind stock from this one product record at read/render time; they do not update a stock copy in every catalogue. Studio documents and export snapshots rebind only stock fields, regardless of whether price/content data is live or fixed.

The public catalogue already refreshes at the approved interval. The authenticated classic preview gains equivalent background refresh behaviour. Studio editor and Studio preview keep their existing 180-second refresh.

## Failure behaviour

- ERP unavailable: synchronization run is marked failed, retries according to the existing policy, and last valid stock remains visible.
- Background catalogue refresh fails: retain the currently rendered catalogue and try again on the next interval.
- Product no longer exists in the local mirror: retain the saved catalogue content; no fabricated live stock value is introduced.

## Verification

- A snapshot-mode Studio design returns current Product stock in its product cards, inventory tables, bound text, and render snapshot.
- An authenticated classic preview requests fresh presentation data after 180 seconds and keeps the previous render if that background request fails.
- Existing public viewer, Studio preview, editor refresh, pricing, role visibility, and PDF tests remain green.

