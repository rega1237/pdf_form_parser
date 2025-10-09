import { Controller } from "@hotwired/stimulus";

const DB_NAME = "aes_pro_offline";
const DB_VERSION = 1; // O la versión que estés manejando

export default class extends Controller {
  async getDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("form_fills")) {
          db.createObjectStore("form_fills", { keyPath: "id" });
        }
      };
    });
  }


}
