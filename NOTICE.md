# License and acknowledgments

Quiet Element is an independent Chrome Manifest V3 extension maintained by
[sukesan666](https://github.com/sukesan666), distributed under the GNU General
Public License version 3 only (SPDX: GPL-3.0-only). See LICENSE for the full text.

## Thanks to AdBlock

We thank Adblock, Inc. and the contributors to
[AdBlock](https://github.com/betafish-inc/adblock-releases) for making their
implementation publicly available. Quiet Element's development studied the
wizard startup, highlighting, overlay selection, preview, confirmation and
cleanup flow. The reference files, functions and implementation differences
are documented in [docs/ADBLOCK-TRACE.md](docs/ADBLOCK-TRACE.md).

The referenced AdBlock source files state Copyright (C) 2013-present Adblock,
Inc. and GNU GPL version 3. Those notices identify the upstream work; they do
not imply that Adblock, Inc. authored or endorses Quiet Element.

No upstream source files, logos, fonts, images, ad filtering engine or bundled
third-party runtime libraries are included in this repository. Quiet Element
uses independently written MV3 implementation code. It is not an official
AdBlock or ChappyBlock product and is not affiliated with or endorsed by them.

## Development dependencies

Playwright is used for development tests only and is not bundled in the Chrome
extension. Its package and dependency notices apply when installed separately.
