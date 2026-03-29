import React from "react";
import { HelpCircle, Mail, Phone, MessageSquare } from "lucide-react";

const HelpCenter = () => {
  const faqs = [
    { q: "How do I update my profile?", a: "Go to Settings in the user menu and update your details." },
    { q: "How do I add movies to my watchlist?", a: "Click the '+' or 'Add to Watchlist' button on any movie details page." },
    { q: "Is AI recommendation free?", a: "Yes! Use the 'Get AI Movie Picks' button to get personalized suggestions." },
  ];

  return (
    <div className="min-h-screen bg-[#141414] text-white pt-24 px-8 md:px-24">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 flex items-center gap-4">
          <HelpCircle className="w-10 h-10 text-[#e50914]" /> Help Center
        </h1>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-[#181818] p-6 rounded-lg text-center hover:bg-[#202020] transition">
            <Mail className="w-8 h-8 mx-auto mb-4 text-red-500" />
            <h3 className="font-semibold mb-2">Email Support</h3>
            <p className="text-sm text-gray-400">support@aiflix.com</p>
          </div>
          <div className="bg-[#181818] p-6 rounded-lg text-center hover:bg-[#202020] transition">
            <Phone className="w-8 h-8 mx-auto mb-4 text-red-500" />
            <h3 className="font-semibold mb-2">Call Center</h3>
            <p className="text-sm text-gray-400">+1 (800) AIFLIX</p>
          </div>
          <div className="bg-[#181818] p-6 rounded-lg text-center hover:bg-[#202020] transition">
            <MessageSquare className="w-8 h-8 mx-auto mb-4 text-red-500" />
            <h3 className="font-semibold mb-2">Live Chat</h3>
            <p className="text-sm text-gray-400">Available 24/7</p>
          </div>
        </div>

        <h2 className="text-2xl font-semibold mb-6">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-[#181818] p-6 rounded-lg border border-[#333333]">
              <h3 className="font-bold text-lg mb-2">{faq.q}</h3>
              <p className="text-gray-400">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;
