// Anteprima della foto della città, con Condividi (menu del telefono) e Scarica.

/**
 * @param {HTMLElement} parent
 * @param {Blob} image
 * @param {string} fileName  es. "traffico-roma.png"
 * @param {string} title     testo che accompagna la condivisione
 */
export function showPhoto(parent, image, fileName, title) {
  const url = URL.createObjectURL(image);
  const overlay = document.createElement('div');
  overlay.className = 'photo';
  const box = document.createElement('div');
  box.className = 'photo-box';
  const img = document.createElement('img');
  img.src = url;
  img.alt = title;
  const buttons = document.createElement('div');
  buttons.className = 'photo-buttons';

  const file = new File([image], fileName, { type: 'image/png' });
  // Su telefono si condivide dove si vuole; dove non si può, resta solo Scarica.
  if (navigator.canShare?.({ files: [file] })) {
    const share = document.createElement('button');
    share.textContent = 'Condividi';
    share.addEventListener('click', () => {
      navigator.share({ files: [file], title }).catch(() => {});
    });
    buttons.appendChild(share);
  }
  const download = document.createElement('button');
  download.textContent = 'Scarica';
  download.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  });
  const close = document.createElement('button');
  close.textContent = 'Chiudi';
  close.className = 'secondary';
  close.addEventListener('click', () => {
    overlay.remove();
    URL.revokeObjectURL(url);
  });
  buttons.append(download, close);
  box.append(img, buttons);
  overlay.appendChild(box);
  parent.appendChild(overlay);
}
