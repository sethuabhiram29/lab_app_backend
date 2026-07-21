const fs = require('fs').promises;
const path = require('path');

async function updateFiles() {
    const basePath = path.join(__dirname, '..');
    const clientSrcPath = path.join(basePath, 'client', 'src');

    // 1. Copy new withPinProtection.js over the old one
    await fs.copyFile(
        path.join(clientSrcPath, 'components', 'withPinProtection.js.new'),
        path.join(clientSrcPath, 'components', 'withPinProtection.js')
    );

    // 2. Update App.js
    const appJsPath = path.join(clientSrcPath, 'App.js');
    let appJs = await fs.readFile(appJsPath, 'utf8');
    
    // Replace imports
    appJs = appJs.replace(
        /import Equipment.*?withPinProtection';/s,
        `import { PinProvider } from './contexts/PinContext';
import {
  ProtectedEquipment,
  ProtectedCommission,
  ProtectedAccountsBalance
} from './components/ProtectedComponents';`
    );

    // Update route components
    appJs = appJs.replace(
        /<Route path="equipment".*?AccountsBalance \/>}/s,
        `<Route path="equipment" element={<ProtectedEquipment />} />
            <Route path="commission" element={<ProtectedCommission />} />
            <Route path="accounts-balance" element={<ProtectedAccountsBalance />} />`
    );

    await fs.writeFile(appJsPath, appJs);

    console.log('Files updated successfully!');
}

updateFiles().catch(console.error);
