import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function flush() {
  const snapshot = await getDocs(collection(db, 'friendRequests'));
  let count = 0;
  for (const document of snapshot.docs) {
    await deleteDoc(doc(db, 'friendRequests', document.id));
    count++;
  }
  console.log(`Flushed ${count} friend requests`);
  process.exit(0);
}
flush().catch(console.error);
