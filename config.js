/* Japan Planner - the settings.
   API_URL:         the web app address of the REAL trip sheet (ends with /exec).
   PREVIEW_API_URL: the web app address of the TEST copy of the sheet. Only the preview app
                    (the address ending in /preview/) uses it.
   Paste each address between its quote marks. Keep the comma after the first line.
   The passcode does NOT go here - each phone asks for it once. */
window.CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwOR1gWj9Gs9Pdm3NTFkXINjmRX0H-GCOVRelUXOjZeYXCV-2pi3Ocj3osPAML3KeETxg/exec',
  PREVIEW_API_URL: 'https://script.google.com/macros/s/AKfycbwqgk-FWT6DD0-UaxndPjVc49QjvOfJO1x_1cdmTe12tReIDpbZq4EUKC3KFBbkfKOtMQ/exec'
};
