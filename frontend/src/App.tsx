// frontend/src/App.tsc

import { Lesson } from './components/Lesson';


function App(){
  return(
    <div className="min-h-screen flex flex-col items-center px-4 pt-8 pb-12">
      <header className="w-full max-w-[920px] mx-auto mb-3 px-[18px] text-center flex flex-col items-center">
        <h1 className="m-0 text-[24px] font-bold text-[var(--text)] leading-[1.2]">
          AI Language Tutor
        </h1>
        <p className="mt-[6px] text-[14px] text-[var(--text-muted)] leading-[1.3]">
          A calm, conversational practice space
        </p>
      </header>
      <main className="w-full max-w-full">
        <Lesson />
      </main>
    </div>
  );
}

export default App;
