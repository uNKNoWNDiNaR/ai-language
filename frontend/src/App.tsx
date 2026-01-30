// frontend/src/App.tsc

import { Lesson } from './components/Lesson';


function App(){
  return(
    <div className="appShell">
      <header className="appHeader">
        <h1 className="appTitle">AI Language Tutor</h1>
        <p className='appSubtitle'>A calm, conversational practice space</p>
      </header>

      <main className='appMain'>
        <Lesson />
      </main>
    </div>
  );
}

export default App;
