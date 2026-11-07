// Tests unitaires : messages français (langue source) posés avant chaque fichier de test, comme
// au build. Un test qui veut une autre langue appelle setMessages.
import { setMessages } from './t.ts';
import fr from './messages/fr.json';

setMessages('fr', fr);
