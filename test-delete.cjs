const admin = require('firebase-admin');

console.log('Iniciando prueba de conexión a Firebase...');
console.log('Intentando cargar el archivo de credenciales...');

try {
  const serviceAccount = require('./backend/src/serviceAccountKey.json');
  console.log('Archivo de credenciales cargado con éxito.');

  console.log('Intentando inicializar Firebase Admin...');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('¡Éxito! La inicialización de Firebase se completó.');

  console.log('Intentando acceder a Firestore...');
  const db = admin.firestore();
  console.log('¡Éxito! Firestore es accesible. La conexión funciona.');

  console.log('Realizando una operación de lectura simple para confirmar...');
  db.collection('gemini-test-connection').limit(1).get().then(() => {
    console.log('¡Prueba completada! La conexión a Firebase y Firestore es 100% funcional.');
    process.exit(0);
  }).catch(err => {
    console.error('Error al intentar leer de Firestore:', err);
    process.exit(1);
  });

} catch (error) {
  console.error('¡FALLO! Error durante el proceso de prueba:');
  console.error(error);
  process.exit(1);
}
