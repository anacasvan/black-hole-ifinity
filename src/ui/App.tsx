/** App shell for the zero-dependency, offline-capable canvas game runtime.
 * The earlier Phaser proof-of-concept is still available in src/game for
 * further experiments; the Immersive Edition is the shipped mobile renderer.
 */
export default function App(){
 return <main className="app-shell">
  <iframe
   src="./demo.html"
   title="Black Hole Infinity — gioco interattivo"
   className="game-frame"
   allow="autoplay"
  />
 </main>;
}
