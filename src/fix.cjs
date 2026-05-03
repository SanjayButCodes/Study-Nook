const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');
c = c.replace(/\s*disableBeacon:\s*true,/g, '');
c = c.replace(/import Joyride from 'react-joyride';\n/g, '');
c = c.replace(/import \{ STATUS, Step \} from 'react-joyride';/g, "import { Joyride, STATUS, Step } from 'react-joyride';");
fs.writeFileSync('src/App.tsx', c);
