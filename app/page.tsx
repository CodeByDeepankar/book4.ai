import BookCard from '@/components/BookCard';
import HeroSection from '@/components/HeroSection';
import { sampleBooks } from '@/lib/constants';
function page() {
  return (
    <main className='wrapper pt-28 mb-10 md:mb-16'>
      <HeroSection />
      <div className='library-books-grid mt-20'>
        {
          sampleBooks.map((book)=>(
            <BookCard key={book._id}  title={book.title} author={book.author} coverURL={book.coverURL} slug={book.slug}/>
          ))
        }
      </div>
    </main>
  )
}

export default page