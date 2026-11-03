// Loaded first by every module, so Firebase is started and the region is set
// before any function is defined (ES module imports run before module code)
import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
// Close to the Netherlands; one instance max keeps it tiny and free
setGlobalOptions({ region: 'europe-west1', maxInstances: 1 });
