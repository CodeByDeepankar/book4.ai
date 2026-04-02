import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import Link from "next/link";

const uploadSteps = [
  {
    id: 1,
    title: "Upload PDF",
    description: "Add your book file",
  },
  {
    id: 2,
    title: "AI Processing",
    description: "We analyze the content",
  },
  {
    id: 3,
    title: "Voice Chat",
    description: "Discuss with AI",
  },
];



export default async function HeroSection() {
  await auth();

  return (
      <section className="wrapper">
        <div className="library-hero-card">
          <div className="library-hero-content">
            <div className="library-hero-text">
              <h1 className="library-hero-title">Your Library</h1>
              <p className="library-hero-description">
                Convert your books into interactive AI conversations.
                <br />
                Listen, learn, and discover your favorite reads.
              </p>

              <Link href="/books/new" className="library-cta-primary max-w-fit px-4 py-2 text-base">
                <span className="text-xl leading-none">+</span>
                <span>Add new book</span>
              </Link>
            </div>

            <div className="library-hero-illustration-desktop" aria-hidden="true">
              <Image
                src="/assets/hero-illustration.png"
                alt="Vintage books, globe, and lamp"
                width={510}
                height={337}
                priority
                className="h-auto w-full max-w-85"
              />
            </div>

            <ol className="library-steps-card hidden lg:flex lg:w-52.5 lg:shrink-0 lg:flex-col lg:gap-5">
              {uploadSteps.map((step) => (
                <li key={step.id} className="library-step-item">
                  <span className="library-step-number">{step.id}</span>
                  <div>
                    <p className="library-step-title">{step.title}</p>
                    <p className="library-step-description">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="library-hero-illustration lg:hidden">
            <Image
              src="/assets/hero-illustration.png"
              alt="Vintage books, globe, and lamp"
              width={510}
              height={337}
              priority
              className="h-auto w-full max-w-75"
            />
          </div>

          <ol className="library-steps-card mt-4 flex flex-col gap-4 lg:hidden">
            {uploadSteps.map((step) => (
              <li key={step.id} className="library-step-item">
                <span className="library-step-number">{step.id}</span>
                <div>
                  <p className="library-step-title">{step.title}</p>
                  <p className="library-step-description">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
  );
}