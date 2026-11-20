<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\User;
use App\Repository\UserRepository;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\Form\Extension\Core\Type\EmailType;
use Symfony\Component\Form\Extension\Core\Type\PasswordType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormError;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Authentication\AuthenticationUtils;
use Symfony\Component\Validator\Constraints as Assert;

final class AccountController extends AbstractController
{
    #[Route('/', name: 'home', methods: ['GET'])]
    public function home(): Response
    {
        return $this->render('portal/home.html.twig');
    }

    #[Route('/inscription', name: 'account_register', methods: ['GET', 'POST'])]
    public function register(
        Request $request,
        UserRepository $users,
        EntityManagerInterface $entities,
        UserPasswordHasherInterface $passwords,
    ): Response {
        if ($this->getUser()) {
            return $this->redirectToRoute('character_list');
        }

        $form = $this->createFormBuilder(null, ['csrf_token_id' => 'register'])
            ->add('nickname', TextType::class, [
                'label' => 'Pseudo',
                'attr' => ['autocomplete' => 'nickname', 'minlength' => 3, 'maxlength' => 40],
                'constraints' => [
                    new Assert\NotBlank(message: 'Saisis un pseudo.'),
                    new Assert\Length(min: 3, max: 40, minMessage: 'Le pseudo doit contenir au moins 3 caractères.', maxMessage: 'Le pseudo doit contenir au plus 40 caractères.'),
                    new Assert\Regex(pattern: '/^[\p{L}\p{M}\p{N}_-]+$/uD', message: 'Utilise des lettres, des chiffres, des tirets ou des tirets bas.'),
                ],
            ])
            ->add('email', EmailType::class, [
                'label' => 'Adresse e-mail',
                'attr' => ['autocomplete' => 'email', 'maxlength' => 254],
                'constraints' => [
                    new Assert\NotBlank(message: 'Saisis ton adresse e-mail.'),
                    new Assert\Email(message: 'Saisis une adresse e-mail valide.'),
                    new Assert\Length(max: 254, maxMessage: 'Cette adresse e-mail est trop longue.'),
                ],
            ])
            ->add('password', PasswordType::class, [
                'label' => 'Mot de passe',
                'attr' => ['autocomplete' => 'new-password', 'minlength' => 12],
                'help' => '12 caractères minimum.',
                'constraints' => [
                    new Assert\NotBlank(message: 'Choisis un mot de passe.'),
                    new Assert\Length(min: 12, minMessage: 'Le mot de passe doit contenir au moins 12 caractères.'),
                    new Assert\Length(max: 72, countUnit: Assert\Length::COUNT_BYTES, maxMessage: 'Le mot de passe est trop long.'),
                    new Assert\Regex(pattern: '/\x00/', match: false, message: 'Le mot de passe contient un caractère non autorisé.'),
                ],
            ])
            ->getForm();

        $form->handleRequest($request);
        if ($form->isSubmitted() && $form->isValid()) {
            $data = $form->getData();
            $nicknameKey = mb_strtolower($data['nickname'], 'UTF-8');
            $email = mb_strtolower($data['email'], 'UTF-8');

            if ($users->findOneBy(['nicknameKey' => $nicknameKey])) {
                $form->get('nickname')->addError(new FormError('Ce pseudo est déjà utilisé.'));
            }
            if ($users->loadUserByIdentifier($email)) {
                $form->get('email')->addError(new FormError('Cette adresse e-mail est déjà utilisée.'));
            }
            if ($form->isValid()) {
                $user = new User($data['nickname'], $nicknameKey, $email);
                $user->setPassword($passwords->hashPassword($user, $data['password']));
                try {
                    $entities->persist($user);
                    $entities->flush();

                    $this->addFlash('success', 'Ton compte est créé. Tu peux te connecter.');

                    return $this->redirectToRoute('account_login', status: Response::HTTP_SEE_OTHER);
                } catch (UniqueConstraintViolationException) {
                    $form->addError(new FormError('Ce pseudo ou cette adresse e-mail est déjà utilisé.'));
                }
            }
        }

        return $this->render('account/register.html.twig', ['form' => $form]);
    }

    #[Route('/connexion', name: 'account_login', methods: ['GET', 'POST'])]
    public function login(AuthenticationUtils $authentication): Response
    {
        if ($this->getUser()) {
            return $this->redirectToRoute('character_list');
        }

        return $this->render('account/login.html.twig', [
            'email' => $authentication->getLastUsername(),
            'error' => $authentication->getLastAuthenticationError(),
        ]);
    }

    #[Route('/deconnexion', name: 'account_logout', methods: ['POST'])]
    public function logout(): never
    {
        throw new \LogicException('La déconnexion est gérée par le pare-feu Symfony.');
    }
}
