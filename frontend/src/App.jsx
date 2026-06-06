import React, { useState } from 'react'
import InputPage from './pages/InputPage.jsx'
import ResultPage from './pages/ResultPage.jsx'

export default function App() {
  const [page, setPage] = useState('input')
  const [itinerary, setItinerary] = useState(null)
  const [inputParams, setInputParams] = useState(null)

  function handleGenerate(data, params) {
    setItinerary(data)
    setInputParams(params)
    setPage('result')
  }

  return (
    <div className="app">
      {page === 'input' && (
        <InputPage onGenerate={handleGenerate} />
      )}
      {page === 'result' && itinerary && (
        <ResultPage
          itinerary={itinerary}
          inputParams={inputParams}
          onBack={() => setPage('input')}
          onItineraryChange={setItinerary}
        />
      )}
    </div>
  )
}
